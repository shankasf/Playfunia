import { UserRepository, WaiverUserRepository, WaiverRepository } from '../repositories';
import { signJwt } from '../utils/jwt';
import type { WaiverAuthLookupInput, WaiverAuthLoginInput } from '../schemas/waiver-auth.schema';

export type LookupResult = {
  status: 'main_user' | 'waiver_user' | 'not_found';
  email?: string;
  phone?: string;
};

/**
 * Build result object excluding undefined values
 */
function buildLookupResult(
  status: LookupResult['status'],
  email?: string | null,
  phone?: string | null,
): LookupResult {
  const result: LookupResult = { status };
  if (email) result.email = email;
  if (phone) result.phone = phone;
  return result;
}

/**
 * Lookup email/phone to determine if it belongs to:
 * - main_user: existing User account (should redirect to normal login)
 * - waiver_user: existing WaiverUser (can auto-login)
 * - not_found: new user (will create WaiverUser)
 */
export async function lookupWaiverAuth(input: WaiverAuthLookupInput): Promise<LookupResult> {
  const { email, phone } = input;

  // Check main User table first
  if (email) {
    const mainUser = await UserRepository.findByEmail(email);
    if (mainUser) {
      return buildLookupResult('main_user', email);
    }
  }

  if (phone) {
    const mainUser = await UserRepository.findByPhone(phone);
    if (mainUser) {
      return buildLookupResult('main_user', undefined, phone);
    }
  }

  // Check WaiverUser table
  let waiverUser = null;
  if (email) {
    waiverUser = await WaiverUserRepository.findByEmail(email);
  } else if (phone) {
    waiverUser = await WaiverUserRepository.findByPhone(phone);
  }

  if (waiverUser) {
    return buildLookupResult('waiver_user', waiverUser.email, waiverUser.phone);
  }

  return buildLookupResult('not_found', email, phone);
}

export type WaiverChild = {
  id?: string;
  name: string;
  birthDate: string;
  gender?: string;
};

export type WaiverAuthResult = {
  token: string;
  isNewUser: boolean;
  waiverUser: {
    id: string;
    email?: string;
    phone?: string;
    guardianName?: string;
    guardianFirstName?: string;
    guardianLastName?: string;
    guardianDateOfBirth?: string;
    relationshipToMinor?: string;
    hasCompletedWaiver: boolean;
    children?: WaiverChild[];
  };
};

/**
 * Build waiverUser response object excluding undefined values
 * Note: hasCompletedWaiver is always false on login - user must sign waiver for EACH visit.
 * The frontend will set this to true after they actually submit/sign today's waiver.
 */
function buildWaiverUserResponse(waiverUser: {
  id: string;
  email: string | null | undefined;
  phone: string | null | undefined;
  guardianName: string | null | undefined;
  guardianFirstName: string | null | undefined;
  guardianLastName: string | null | undefined;
  guardianDateOfBirth: string | null | undefined;
  relationshipToMinor: string | null | undefined;
  lastWaiverSignedAt: string | null | undefined;
  children: WaiverChild[];
}): WaiverAuthResult['waiverUser'] {
  const result: WaiverAuthResult['waiverUser'] = {
    id: waiverUser.id,
    // Always false on login - they need to sign for THIS visit
    hasCompletedWaiver: false,
  };
  if (waiverUser.email) result.email = waiverUser.email;
  if (waiverUser.phone) result.phone = waiverUser.phone;
  if (waiverUser.guardianName) result.guardianName = waiverUser.guardianName;
  if (waiverUser.guardianFirstName) result.guardianFirstName = waiverUser.guardianFirstName;
  if (waiverUser.guardianLastName) result.guardianLastName = waiverUser.guardianLastName;
  if (waiverUser.guardianDateOfBirth) result.guardianDateOfBirth = waiverUser.guardianDateOfBirth;
  if (waiverUser.relationshipToMinor) result.relationshipToMinor = waiverUser.relationshipToMinor;
  if (waiverUser.children && waiverUser.children.length > 0) {
    result.children = waiverUser.children;
  }
  return result;
}

/**
 * Login or register a waiver-only user.
 * Returns a JWT token scoped to waiver access only.
 *
 * For main account users using phone/email, this creates a waiver_user entry
 * and pulls their existing waiver data - allowing waiver signing without full account login.
 */
export async function loginOrRegisterWaiverUser(
  input: WaiverAuthLoginInput,
): Promise<WaiverAuthResult> {
  const { email, phone } = input;

  // Find existing waiver user
  let waiverUser = null;
  if (email) {
    waiverUser = await WaiverUserRepository.findByEmail(email);
  } else if (phone) {
    waiverUser = await WaiverUserRepository.findByPhone(phone);
  }

  let isNewUser = false;
  let guardianNameFromMainUser: string | null = null;

  // If no waiver_user found, check if this is a main account user
  // and try to get their guardian name from existing waivers
  if (!waiverUser) {
    let mainUserEmail: string | null = null;

    if (email) {
      const mainUser = await UserRepository.findByEmail(email);
      if (mainUser) {
        mainUserEmail = mainUser.email;
        guardianNameFromMainUser = `${mainUser.first_name} ${mainUser.last_name || ''}`.trim();
      }
    } else if (phone) {
      const mainUser = await UserRepository.findByPhone(phone);
      if (mainUser) {
        mainUserEmail = mainUser.email;
        guardianNameFromMainUser = `${mainUser.first_name} ${mainUser.last_name || ''}`.trim();
      }
    }

    // If main user found, check for their existing waiver to get guardian details
    if (mainUserEmail) {
      const existingWaiver = await WaiverRepository.findValidByEmail(mainUserEmail);
      if (existingWaiver) {
        // Build guardian name from first/last name columns
        const waiverGuardianName = `${existingWaiver.guardian_first_name || ''} ${existingWaiver.guardian_last_name || ''}`.trim();
        guardianNameFromMainUser = waiverGuardianName || guardianNameFromMainUser;
      }
    }

    // Create new waiver user with guardian name if available
    waiverUser = await WaiverUserRepository.create({
      email: email?.toLowerCase(),
      phone,
      guardian_name: guardianNameFromMainUser ?? undefined,
      marketing_opt_in: false,
    });
    isNewUser = true;
  }

  // Generate JWT with waiver-only scope
  const token = signJwt({
    sub: String(waiverUser.waiver_user_id),
    email: waiverUser.email ?? undefined,
    phone: waiverUser.phone ?? undefined,
    type: 'waiver_user',
    roles: ['waiver_only'],
  });

  // Map children from waiver_user_children to WaiverChild format
  const children: WaiverChild[] = [];
  if (waiverUser.waiver_user_children && Array.isArray(waiverUser.waiver_user_children) && waiverUser.waiver_user_children.length > 0) {
    for (const child of waiverUser.waiver_user_children) {
      const name = `${child.minor_first_name || ''} ${child.minor_last_name || ''}`.trim();
      children.push({
        id: String(child.waiver_user_child_id),
        name: name || 'Unknown',
        birthDate: child.minor_date_of_birth || '',
        gender: child.minor_gender || undefined,
      });
    }
  } else {
    // For old customers, children may only be in waiver_submissions.children JSONB
    // Fetch from latest waiver submission if waiver_user_children is empty
    const latestWaivers = await WaiverRepository.findByWaiverUserId(waiverUser.waiver_user_id);
    const latestWaiver = latestWaivers[0];
    if (latestWaiver?.children && Array.isArray(latestWaiver.children)) {
      for (const child of latestWaiver.children as Array<{ name?: string; first_name?: string; last_name?: string; birthDate?: string; birth_date?: string; gender?: string }>) {
        const name = child.name || `${child.first_name || ''} ${child.last_name || ''}`.trim();
        children.push({
          name: name || 'Unknown',
          birthDate: child.birthDate || child.birth_date || '',
          gender: child.gender || undefined,
        });
      }
    } else if (!isNewUser && waiverUser.email) {
      // Also try to find waivers by email for main account users using waiver auth
      const emailWaivers = await WaiverRepository.findByEmail(waiverUser.email);
      const emailWaiver = emailWaivers[0];
      if (emailWaiver?.children && Array.isArray(emailWaiver.children)) {
        for (const child of emailWaiver.children as Array<{ name?: string; first_name?: string; last_name?: string; birthDate?: string; birth_date?: string; gender?: string }>) {
          const name = child.name || `${child.first_name || ''} ${child.last_name || ''}`.trim();
          children.push({
            name: name || 'Unknown',
            birthDate: child.birthDate || child.birth_date || '',
            gender: child.gender || undefined,
          });
        }
      }
    }
  }

  // For old customers, also get guardian details from latest waiver submission if not in waiver_users
  let guardianFirstName = waiverUser.guardian_first_name;
  let guardianLastName = waiverUser.guardian_last_name;
  let guardianDateOfBirth = waiverUser.guardian_date_of_birth;
  let relationshipToMinor = waiverUser.relationship_to_minor;

  if (!guardianFirstName && !isNewUser) {
    // Try to get details from waiver submissions
    const waivers = await WaiverRepository.findByWaiverUserId(waiverUser.waiver_user_id);
    let latestWaiver = waivers[0];

    // Also try by email if no waiver found by waiver_user_id
    if (!latestWaiver && waiverUser.email) {
      const emailWaivers = await WaiverRepository.findByEmail(waiverUser.email);
      latestWaiver = emailWaivers[0];
    }

    if (latestWaiver) {
      guardianFirstName = latestWaiver.guardian_first_name;
      guardianLastName = latestWaiver.guardian_last_name;
      guardianDateOfBirth = latestWaiver.guardian_date_of_birth;
      relationshipToMinor = latestWaiver.relationship_to_minor || latestWaiver.relationship_to_children;
    }
  }

  return {
    token,
    isNewUser,
    waiverUser: buildWaiverUserResponse({
      id: String(waiverUser.waiver_user_id),
      email: waiverUser.email,
      phone: waiverUser.phone,
      guardianName: waiverUser.guardian_name,
      guardianFirstName,
      guardianLastName,
      guardianDateOfBirth,
      relationshipToMinor,
      lastWaiverSignedAt: waiverUser.last_waiver_signed_at,
      children,
    }),
  };
}

/**
 * Get waiver user by ID
 */
export async function getWaiverUserById(id: string) {
  const waiverUserId = parseInt(id, 10);
  if (isNaN(waiverUserId)) return null;
  return WaiverUserRepository.findById(waiverUserId);
}
