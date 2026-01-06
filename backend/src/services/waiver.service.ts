import { DateTime } from 'luxon';
import {
  UserRepository,
  CustomerRepository,
  ChildRepository,
  WaiverRepository,
  WaiverUserRepository,
  WaiverVisitRepository,
} from '../repositories';
import { AppError } from '../utils/app-error';
import { publishAdminEvent } from './admin-events.service';
import type { SignWaiverInput } from '../schemas/waiver.schema';

/**
 * Compare waiver data to check if anything has changed
 */
function hasWaiverDataChanged(
  latestWaiver: {
    guardian_name: string;
    guardian_email?: string;
    guardian_phone?: string;
    guardian_date_of_birth?: string;
    relationship_to_children?: string;
  },
  existingChildren: Array<{ name: string; birth_date: string; gender?: string }>,
  input: SignWaiverInput
): boolean {
  // Compare guardian info
  if (latestWaiver.guardian_name !== input.guardianName) return true;
  if ((latestWaiver.guardian_email || '') !== (input.guardianEmail || '')) return true;
  if ((latestWaiver.guardian_phone || '') !== (input.guardianPhone || '')) return true;

  const latestDob = latestWaiver.guardian_date_of_birth?.split('T')[0] || '';
  const inputDob = input.guardianDob?.toISOString().split('T')[0] || '';
  if (latestDob !== inputDob) return true;

  if ((latestWaiver.relationship_to_children || '') !== (input.relationshipToChildren || '')) return true;

  // Compare children from waiver_user_children table
  const inputChildren = input.children || [];

  if (existingChildren.length !== inputChildren.length) return true;

  for (let i = 0; i < existingChildren.length; i++) {
    const latest = existingChildren[i];
    const current = inputChildren[i];
    if (!latest || !current) return true;
    if (latest.name !== current.name) return true;
    const latestBirthDate = latest.birth_date?.split('T')[0] || '';
    const currentBirthDate = current.birthDate?.toISOString().split('T')[0] || '';
    if (latestBirthDate !== currentBirthDate) return true;
    if ((latest.gender || '') !== (current.gender || '')) return true;
  }

  return false;
}

/**
 * Sign waiver for a main user (has User account).
 */
export async function signWaiver(guardianId: string, input: SignWaiverInput) {
  const userId = parseInt(guardianId, 10);
  if (isNaN(userId)) {
    throw new AppError('Invalid guardian ID', 400);
  }

  const guardian = await UserRepository.findById(userId);
  if (!guardian) {
    throw new AppError('Guardian not found', 404);
  }

  let customerId = guardian.customer_id;
  
  // If guardian has no customer record, find existing or create one
  if (!customerId) {
    // First check if a customer already exists with this email
    let existingCustomer = null;
    if (guardian.email) {
      existingCustomer = await CustomerRepository.findByEmail(guardian.email);
    }
    
    if (existingCustomer) {
      // Use existing customer
      customerId = existingCustomer.customer_id;
    } else {
      // Create new customer
      const fullName = [guardian.first_name, guardian.last_name].filter(Boolean).join(' ').trim() || 'Guardian';
      const newCustomer = await CustomerRepository.create({
        full_name: fullName,
        email: guardian.email,
        phone: guardian.phone,
      });
      customerId = newCustomer.customer_id;
    }
    
    // Update user with the customer_id
    await UserRepository.update(userId, { customer_id: customerId });
  }

  const childIds: number[] = [];

  try {
    for (const child of input.children) {
      const { firstName, lastName } = splitName(child.name);
      if (!firstName) {
        throw new AppError('Each child must include a first name.', 400);
      }

      // Check for existing child with same first name and birth date
      const existingChildren = await ChildRepository.findByCustomerId(customerId);
      const birthDateStr = child.birthDate.toISOString().split('T')[0];
      
      const existing = existingChildren.find(
        (c) =>
          c.first_name?.toLowerCase() === firstName.toLowerCase() &&
          c.birth_date?.startsWith(birthDateStr)
      );

      let childRecord;

      if (existing) {
        // Update existing child if needed
        const updates: Record<string, unknown> = {};
        if (lastName && !existing.last_name) {
          updates.last_name = lastName;
        }
        if (child.gender && !existing.gender) {
          updates.gender = child.gender;
        }
        
        if (Object.keys(updates).length > 0) {
          childRecord = await ChildRepository.update(existing.child_id, updates);
        } else {
          childRecord = existing;
        }
      } else {
        // Create new child
        childRecord = await ChildRepository.create({
          customer_id: customerId,
          first_name: firstName,
          last_name: lastName,
          birth_date: birthDateStr,
          gender: child.gender,
        });
      }

      if (!childIds.includes(childRecord.child_id)) {
        childIds.push(childRecord.child_id);
      }
    }

    const archiveUntil = DateTime.now().plus({ years: 5 }).toISO();

    // Create waiver submission (no JSONB children - use child_ids instead)
    const waiver = await WaiverRepository.create({
      customer_id: customerId,
      guardian_name: input.guardianName,
      guardian_email: input.guardianEmail,
      guardian_phone: input.guardianPhone,
      guardian_date_of_birth: input.guardianDob?.toISOString().split('T')[0],
      relationship_to_children: input.relationshipToChildren,
      signature: input.signature,
      accepted_policies: input.acceptedPolicies,
      marketing_opt_in: input.marketingOptIn ?? false,
      archive_until: archiveUntil ?? undefined,
    });

    publishAdminEvent('waiver.updated', {
      guardianId,
      waiverId: waiver.waiver_submission_id,
      signedAt: waiver.signed_at,
    });

    return {
      id: waiver.waiver_submission_id,
      guardianName: waiver.guardian_name,
      guardianEmail: waiver.guardian_email,
      guardianPhone: waiver.guardian_phone,
      children: input.children.map((child, index) => ({
        name: child.name,
        birthDate: child.birthDate.toISOString(),
        gender: child.gender,
        childId: childIds[index],
      })),
      signedAt: waiver.signed_at,
      signature: waiver.signature,
    };
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    throw new AppError(
      "We couldn't save the waiver right now. Please try again in a moment.",
      500,
      { cause: error },
    );
  }
}

function splitName(fullName: string) {
  const parts = fullName.trim().split(/\s+/);
  const [firstNameRaw, ...rest] = parts;
  const firstName = firstNameRaw ?? '';
  const lastName = rest.length > 0 ? rest.join(' ') : undefined;
  return { firstName, lastName };
}

/**
 * Transform waiver submission from snake_case (DB) to camelCase (API)
 * Children are fetched from waiver_user_children table, not JSONB
 */
function transformWaiverSubmission(waiver: Record<string, unknown>) {
  return {
    id: waiver.submission_id ?? waiver.waiver_submission_id,
    guardianName: waiver.guardian_name ?? null,
    guardianEmail: waiver.guardian_email ?? null,
    guardianPhone: waiver.guardian_phone ?? null,
    guardianDateOfBirth: waiver.guardian_date_of_birth ?? null,
    relationshipToChildren: waiver.relationship_to_children ?? null,
    childIds: waiver.child_ids || [],
    signature: waiver.signature ?? null,
    signedAt: waiver.signed_at,
    expiresAt: waiver.expires_at ?? null,
    archiveUntil: waiver.archive_until ?? null,
    marketingOptIn: waiver.marketing_opt_in ?? false,
    acceptedPolicies: waiver.accepted_policies || [],
  };
}

export async function listWaiversForGuardian(guardianId: string) {
  const userId = parseInt(guardianId, 10);
  if (isNaN(userId)) return [];

  const user = await UserRepository.findById(userId);
  if (!user) return [];

  // Try to find waivers by customer_id first
  let waivers: Array<Record<string, unknown>> = [];
  if (user.customer_id) {
    waivers = await WaiverRepository.findByCustomerId(user.customer_id);
  }

  // If no waivers found by customer_id, also search by email
  // This handles cases where waiver was signed before account creation
  if (waivers.length === 0 && user.email) {
    waivers = await WaiverRepository.findByEmail(user.email);
  }

  return waivers.map(transformWaiverSubmission);
}

export async function listAllWaivers() {
  return WaiverRepository.findAll({ limit: 100 });
}

/**
 * List waivers for a waiver-only user (transformed to camelCase)
 * Also checks for waivers signed by main account users with matching email/phone
 */
export async function listWaiversForWaiverUser(waiverUserId: string) {
  const waiverUserIdNum = parseInt(waiverUserId, 10);
  if (isNaN(waiverUserIdNum)) return [];

  const waiverUser = await WaiverUserRepository.findById(waiverUserIdNum);
  if (!waiverUser) {
    return [];
  }

  // Get waivers signed directly by this waiver user
  const waiverUserWaivers = await WaiverRepository.findByWaiverUserId(waiverUserIdNum);

  // Also check for waivers signed by main account with matching email
  // This allows main account users to see their existing waivers when using waiver auth
  let mainAccountWaivers: Awaited<ReturnType<typeof WaiverRepository.findByGuardianEmail>> = [];
  if (waiverUser.email) {
    mainAccountWaivers = await WaiverRepository.findByGuardianEmail(waiverUser.email);
  } else if (waiverUser.phone) {
    // If only phone, check by phone number in guardian_phone field
    mainAccountWaivers = await WaiverRepository.findByGuardianPhone(waiverUser.phone);
  }

  // Combine and deduplicate by waiver_id
  const allWaivers = [...waiverUserWaivers, ...mainAccountWaivers];
  const uniqueWaivers = allWaivers.filter(
    (waiver, index, self) => index === self.findIndex((w) => w.waiver_id === waiver.waiver_id)
  );

  // Sort by signed_at descending (most recent first)
  uniqueWaivers.sort((a, b) => {
    const dateA = a.signed_at ? new Date(a.signed_at).getTime() : 0;
    const dateB = b.signed_at ? new Date(b.signed_at).getTime() : 0;
    return dateB - dateA;
  });

  return uniqueWaivers.map(transformWaiverSubmission);
}

/**
 * Sign waiver for a waiver-only user (no main account).
 * Stores guardian details in WaiverUser and creates a waiver record.
 * If quickResign is true and data hasn't changed, only records a visit.
 */
export async function signWaiverForWaiverUser(waiverUserId: string, input: SignWaiverInput) {
  const waiverUserIdNum = parseInt(waiverUserId, 10);
  if (isNaN(waiverUserIdNum)) {
    throw new AppError('Invalid waiver user ID', 400);
  }

  const waiverUser = await WaiverUserRepository.findById(waiverUserIdNum);
  if (!waiverUser) {
    throw new AppError('Waiver user not found', 404);
  }

  try {
    // Fetch existing children from waiver_user_children for comparison
    const existingChildrenRaw = waiverUser.waiver_user_children || [];
    const existingChildren = existingChildrenRaw.map((c: Record<string, unknown>) => ({
      name: `${c.minor_first_name || ''} ${c.minor_last_name || ''}`.trim(),
      birth_date: c.minor_date_of_birth as string || '',
      gender: c.minor_gender as string | undefined,
    }));

    // Check if this is a quick re-sign with unchanged data
    if (input.quickResign) {
      const existingWaivers = await WaiverRepository.findByWaiverUserId(waiverUserIdNum);
      const latestWaiver = existingWaivers[0];

      if (latestWaiver && !hasWaiverDataChanged(latestWaiver, existingChildren, input)) {
        // Data hasn't changed - just record the visit and update timestamp
        await WaiverUserRepository.update(waiverUserIdNum, {
          last_waiver_signed_at: new Date().toISOString(),
        });

        // Record the visit linked to the existing waiver
        await WaiverVisitRepository.create({
          waiver_user_id: waiverUserIdNum,
          waiver_submission_id: latestWaiver.waiver_submission_id,
        });

        publishAdminEvent('waiver.visit_recorded', {
          waiverUserId,
          waiverId: latestWaiver.waiver_submission_id,
          visitedAt: new Date().toISOString(),
          dataChanged: false,
        });

        // Return existing children from waiver_user_children table
        return {
          id: latestWaiver.waiver_submission_id,
          guardianName: latestWaiver.guardian_name,
          guardianEmail: latestWaiver.guardian_email,
          guardianPhone: latestWaiver.guardian_phone,
          children: existingChildren.map((c: { name: string; birth_date: string; gender?: string }) => ({
            name: c.name,
            birthDate: c.birth_date,
            gender: c.gender,
          })),
          signedAt: new Date().toISOString(), // Current visit time
          signature: latestWaiver.signature,
          quickResign: true,
          dataChanged: false,
        };
      }
    }

    // Data has changed or not a quick re-sign - create new waiver record
    // Update WaiverUser with guardian details (using new schema column names)
    const { firstName: guardianFirstName, lastName: guardianLastName } = splitName(input.guardianName);
    const updateData: Record<string, unknown> = {
      guardian_first_name: guardianFirstName || 'Unknown',
      guardian_last_name: guardianLastName || '',
      guardian_date_of_birth: input.guardianDob?.toISOString().split('T')[0],
      marketing_opt_in: input.marketingOptIn ?? false,
      last_waiver_signed_at: new Date().toISOString(),
    };

    if (input.relationshipToChildren) updateData.relationship_to_minor = input.relationshipToChildren;

    // Update email/phone if provided and not already set (using new schema column names)
    if (input.guardianEmail && !waiverUser.guardian_email) {
      updateData.guardian_email = input.guardianEmail.toLowerCase();
    }
    if (input.guardianPhone && !waiverUser.guardian_phone) {
      updateData.guardian_phone = input.guardianPhone;
    }

    await WaiverUserRepository.update(waiverUserIdNum, updateData);

    // Update children - filter out entries with missing birth dates
    await WaiverUserRepository.updateChildren(
      waiverUserIdNum,
      input.children.map((child) => ({
        name: child.name,
        birth_date: child.birthDate?.toISOString().split('T')[0] ?? '',
        gender: child.gender,
      })).filter(child => child.birth_date) // Only include children with valid birth dates
    );

    const archiveUntil = DateTime.now().plus({ years: 5 }).toISO();

    // Create waiver submission record (no JSONB children - stored in waiver_user_children)
    const waiver = await WaiverRepository.create({
      waiver_user_id: waiverUserIdNum,
      guardian_name: input.guardianName,
      guardian_email: input.guardianEmail,
      guardian_phone: input.guardianPhone,
      guardian_date_of_birth: input.guardianDob?.toISOString().split('T')[0],
      relationship_to_children: input.relationshipToChildren,
      signature: input.signature,
      accepted_policies: input.acceptedPolicies,
      marketing_opt_in: input.marketingOptIn ?? false,
      archive_until: archiveUntil ?? undefined,
    });

    // Record the visit linked to the new waiver
    await WaiverVisitRepository.create({
      waiver_user_id: waiverUserIdNum,
      waiver_submission_id: waiver.waiver_submission_id,
    });

    publishAdminEvent('waiver.updated', {
      waiverUserId,
      waiverId: waiver.waiver_submission_id,
      signedAt: waiver.signed_at,
      dataChanged: true,
    });

    return {
      id: waiver.waiver_submission_id,
      guardianName: waiver.guardian_name,
      guardianEmail: waiver.guardian_email,
      guardianPhone: waiver.guardian_phone,
      children: input.children.map((child) => ({
        name: child.name,
        birthDate: child.birthDate.toISOString(),
        gender: child.gender,
      })),
      signedAt: waiver.signed_at,
      signature: waiver.signature,
      quickResign: input.quickResign ?? false,
      dataChanged: true,
    };
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    throw new AppError(
      "We couldn't save the waiver right now. Please try again in a moment.",
      500,
      { cause: error },
    );
  }
}
