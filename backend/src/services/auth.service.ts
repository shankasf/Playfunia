import type { RegisterInput, LoginInput } from '../schemas/auth.schema';
import { UserRepository, ChildRepository, WaiverRepository, CustomerRepository, MembershipRepository } from '../repositories';
import { AppError } from '../utils/app-error';
import { hashPassword, verifyPassword } from '../utils/password';
import { signJwt } from '../utils/jwt';
import { appConfig } from '../config/env';
import { supabase } from '../config/supabase';

interface AuthTokenPayload extends Record<string, unknown> {
  sub: string;
  email: string;
  roles: string[];
}

const SENSITIVE_FIELDS = ['password_hash'] as const;

function sanitizeUser(user: Record<string, unknown>) {
  const sanitized = { ...user };
  for (const field of SENSITIVE_FIELDS) {
    delete sanitized[field];
  }
  // Map DB field names to API field names for backward compatibility
  return {
    id: sanitized.user_id,
    firstName: sanitized.first_name,
    lastName: sanitized.last_name,
    email: sanitized.email,
    phone: sanitized.phone,
    roles: sanitized.roles,
    customerId: sanitized.customer_id,
    createdAt: sanitized.created_at,
    updatedAt: sanitized.updated_at,
  };
}

// Check if email is already registered
export async function checkEmailExists(email: string): Promise<boolean> {
  const normalizedEmail = email.trim().toLowerCase();
  const existing = await UserRepository.findByEmail(normalizedEmail);
  return !!existing;
}

// Hash password for pending registration
export async function prepareRegistration(input: RegisterInput): Promise<{
  email: string;
  passwordHash: string;
  password: string;
  firstName: string;
  lastName: string;
  phone?: string;
}> {
  const normalizedEmail = input.email.trim().toLowerCase();
  const existing = await UserRepository.findByEmail(normalizedEmail);

  if (existing) {
    throw new AppError('A user with this email already exists', 409);
  }

  const passwordHash = await hashPassword(input.password);

  return {
    email: normalizedEmail,
    passwordHash,
    password: input.password, // Store raw password temporarily for Supabase Auth
    firstName: input.firstName,
    lastName: input.lastName,
    phone: input.phone,
  };
}

// Create user from verified registration data
export async function createVerifiedUser(data: {
  email: string;
  passwordHash: string;
  password: string; // Raw password for Supabase Auth
  firstName: string;
  lastName: string;
  phone?: string;
}) {
  const normalizedEmail = data.email.trim().toLowerCase();

  // Double-check email doesn't exist (race condition protection)
  const existing = await UserRepository.findByEmail(normalizedEmail);
  if (existing) {
    // User already exists - this can happen if they registered before
    // Just return the existing user so they can sign in
    const token = signAuthToken(String(existing.user_id), existing.email, existing.roles ?? ['user']);
    return {
      user: sanitizeUser(existing),
      token,
    };
  }

  // Create user in Supabase Auth first (so frontend can sign in)
  let authUserId: string | undefined;
  const { data: authData, error: authError } = await supabase.auth.admin.createUser({
    email: normalizedEmail,
    password: data.password,
    email_confirm: true, // Already verified via our OTP
    user_metadata: {
      first_name: data.firstName,
      last_name: data.lastName,
      phone: data.phone,
    },
  });

  if (authError) {
    // If user already exists in Supabase Auth, get their ID and update their password
    if (authError.message.includes('already been registered')) {
      // Look up existing auth user via Supabase Admin API (not public.users which may not exist yet)
      const { data: userList, error: listError } = await supabase.auth.admin.listUsers();
      if (!listError && userList?.users) {
        const existingAuthUser = userList.users.find(
          (u) => u.email?.toLowerCase() === normalizedEmail
        );
        if (existingAuthUser) {
          authUserId = existingAuthUser.id;
          // Update their password so email/password login works
          // (they may have originally signed up via Google OAuth)
          try {
            await supabase.auth.admin.updateUserById(existingAuthUser.id, {
              password: data.password,
            });
          } catch (updateErr) {
            console.error('Failed to update Supabase Auth password for existing user:', updateErr);
          }
        }
      }
    } else {
      console.error('Failed to create Supabase Auth user:', authError);
      throw new AppError('Failed to create account. Please try again.', 500);
    }
  } else {
    authUserId = authData?.user?.id;
  }

  // Create user in our public.users table
  try {
    const user = await UserRepository.create({
      first_name: data.firstName,
      last_name: data.lastName,
      email: normalizedEmail,
      password_hash: data.passwordHash,
      phone: data.phone,
      roles: ['user'],
      auth_user_id: authUserId,
    });

    const token = signAuthToken(String(user.user_id), user.email, user.roles ?? ['user']);

    return {
      user: sanitizeUser(user),
      token,
    };
  } catch (err: unknown) {
    // Handle duplicate key error - user was created between our check and insert
    const error = err as { code?: string };
    if (error.code === '23505') {
      const existingUser = await UserRepository.findByEmail(normalizedEmail);
      if (existingUser) {
        const token = signAuthToken(String(existingUser.user_id), existingUser.email, existingUser.roles ?? ['user']);
        return {
          user: sanitizeUser(existingUser),
          token,
        };
      }
    }
    throw err;
  }
}

// Legacy register function (creates user immediately) - kept for backwards compatibility
export async function registerUser(input: RegisterInput) {
  const normalizedEmail = input.email.trim().toLowerCase();
  const existing = await UserRepository.findByEmail(normalizedEmail);

  if (existing) {
    throw new AppError('A user with this email already exists', 409);
  }

  const passwordHash = await hashPassword(input.password);

  const user = await UserRepository.create({
    first_name: input.firstName,
    last_name: input.lastName,
    email: normalizedEmail,
    password_hash: passwordHash,
    phone: input.phone,
    roles: ['user'],
  });

  const token = signAuthToken(String(user.user_id), user.email, user.roles ?? ['user']);

  return {
    user: sanitizeUser(user),
    token,
  };
}

export async function loginUser(input: LoginInput) {
  const normalizedEmail = input.email.trim().toLowerCase();
  const user = await UserRepository.findByEmail(normalizedEmail);

  if (!user) {
    throw new AppError('Invalid email or password', 401);
  }

  if (!user.password_hash) {
    throw new AppError('Invalid email or password', 401);
  }

  const isValidPassword = await verifyPassword(input.password, user.password_hash);

  if (!isValidPassword) {
    throw new AppError('Invalid email or password', 401);
  }

  const token = signAuthToken(String(user.user_id), user.email, user.roles ?? ['user']);

  return {
    user: sanitizeUser(user),
    token,
  };
}

export async function ensureDefaultAdminUser() {
  const email = appConfig.defaultAdminEmail?.trim();
  const password = appConfig.defaultAdminPassword;

  if (!email || !password) {
    return;
  }

  const normalizedEmail = email.toLowerCase();
  const existing = await UserRepository.findByEmail(normalizedEmail);

  if (!existing) {
    const passwordHash = await hashPassword(password);
    await UserRepository.create({
      first_name: 'Admin',
      last_name: 'User',
      email: normalizedEmail,
      password_hash: passwordHash,
      roles: ['user', 'admin', 'staff'],
    });
    console.info(`Default admin account created for ${normalizedEmail}.`);
    return;
  }

  let hasChanges = false;
  const updates: Record<string, unknown> = {};
  const currentRoles = existing.roles ?? [];

  if (!currentRoles.includes('admin') || !currentRoles.includes('staff')) {
    const merged = new Set(currentRoles.map((role: string) => role.toLowerCase()));
    merged.add('admin');
    merged.add('staff');
    updates.roles = Array.from(merged);
    hasChanges = true;
  }

  const passwordMatches = await verifyPassword(password, existing.password_hash);
  if (!passwordMatches) {
    updates.password_hash = await hashPassword(password);
    hasChanges = true;
  }

  if (hasChanges) {
    await UserRepository.update(existing.user_id, updates);
    console.info(`Default admin account updated for ${normalizedEmail}.`);
  }
}

export async function getUserProfile(userId: string) {
  const userIdNum = parseInt(userId, 10);
  if (isNaN(userIdNum)) {
    throw new AppError('Invalid user ID', 400);
  }

  const user = await UserRepository.findById(userIdNum);

  if (!user) {
    throw new AppError('User not found', 404);
  }

  // Get children for this user's customer
  let children: Array<{
    id: number;
    firstName: string;
    lastName: string | null;
    birthDate: string | null;
    gender: string | null;
    photoUrl: string | null;
  }> = [];
  
  if (user.customer_id) {
    const dbChildren = await ChildRepository.findByCustomerId(user.customer_id);
    children = dbChildren.map((c) => ({
      id: c.child_id,
      firstName: c.first_name,
      lastName: c.last_name,
      birthDate: c.birth_date,
      gender: c.gender,
      photoUrl: c.photo_url ?? null,
    }));
  }

  // Check for valid waiver
  const validWaiver = user.email ? await WaiverRepository.findValidByEmail(user.email) : null;

  // Get active membership
  let membership: Record<string, unknown> | undefined;
  if (user.customer_id) {
    const activeMembership = await MembershipRepository.findByCustomerId(user.customer_id);
    if (activeMembership && activeMembership.status === 'active') {
      membership = {
        membershipId: String(activeMembership.membership_id),
        tierName: activeMembership.tier,
        startedAt: activeMembership.start_date,
        expiresAt: activeMembership.end_date,
        autoRenew: activeMembership.auto_renew ?? false,
        visitsPerMonth: activeMembership.visits_per_month,
        visitsUsed: activeMembership.visits_used_this_period ?? 0,
        visitPeriodStart: activeMembership.visit_period_start,
        lastVisitAt: activeMembership.last_visit_at,
      };
    }
  }

  const profile = sanitizeUser(user);
  return {
    ...profile,
    children,
    membership,
    hasValidWaiver: Boolean(validWaiver),
  };
}

function signAuthToken(userId: string, email: string, roles: string[]) {
  const payload: AuthTokenPayload = {
    sub: userId,
    email,
    roles,
  };

  return signJwt(payload);
}

async function ensureCustomerForUser(user: { user_id: number; email: string; first_name: string; last_name: string; phone?: string; customer_id?: number | null }) {
  // If user already has a customer_id, return it
  if (user.customer_id) {
    return user.customer_id;
  }

  // Check if customer with this email exists
  const existingCustomer = await CustomerRepository.findByEmail(user.email);
  if (existingCustomer) {
    // Link user to existing customer
    await UserRepository.update(user.user_id, { customer_id: existingCustomer.customer_id });
    return existingCustomer.customer_id;
  }

  // Create new customer
  const fullName = `${user.first_name} ${user.last_name}`.trim();
  const newCustomer = await CustomerRepository.create({
    full_name: fullName,
    email: user.email.toLowerCase(),
    phone: user.phone ?? null,
  });

  // Link user to new customer
  await UserRepository.update(user.user_id, { customer_id: newCustomer.customer_id });
  return newCustomer.customer_id;
}

export async function addChildForUser(userId: string, input: { firstName: string; lastName?: string; birthDate?: string; gender?: string }) {
  const userIdNum = parseInt(userId, 10);
  if (isNaN(userIdNum)) {
    throw new AppError('Invalid user ID', 400);
  }

  const user = await UserRepository.findById(userIdNum);
  if (!user) {
    throw new AppError('User not found', 404);
  }

  // Ensure user has a customer record
  const customerId = await ensureCustomerForUser(user);

  // Create child
  const child = await ChildRepository.create({
    customer_id: customerId,
    first_name: input.firstName,
    last_name: input.lastName,
    birth_date: input.birthDate,
    gender: input.gender,
  });

  return {
    id: child.child_id,
    firstName: child.first_name,
    lastName: child.last_name,
    birthDate: child.birth_date,
    gender: child.gender,
  };
}

export async function deleteChildForUser(userId: string, childId: number) {
  const userIdNum = parseInt(userId, 10);
  if (isNaN(userIdNum)) {
    throw new AppError('Invalid user ID', 400);
  }

  const user = await UserRepository.findById(userIdNum);
  if (!user) {
    throw new AppError('User not found', 404);
  }

  if (!user.customer_id) {
    throw new AppError('No customer record for user', 400);
  }

  // Verify child belongs to user's customer
  const child = await ChildRepository.findById(childId);
  if (!child) {
    throw new AppError('Child not found', 404);
  }

  if (child.customer_id !== user.customer_id) {
    throw new AppError('Child does not belong to this user', 403);
  }

  await ChildRepository.delete(childId);
}

export async function resetUserPassword(email: string, newPassword: string) {
  const normalizedEmail = email.trim().toLowerCase();
  const user = await UserRepository.findByEmail(normalizedEmail);

  if (!user) {
    throw new AppError('User not found', 404);
  }

  const passwordHash = await hashPassword(newPassword);
  await UserRepository.update(user.user_id, { password_hash: passwordHash });

  // Also update password in Supabase Auth if user has an auth account
  if (user.auth_user_id) {
    try {
      await supabase.auth.admin.updateUserById(user.auth_user_id, {
        password: newPassword,
      });
    } catch (authError) {
      console.error('Failed to update Supabase Auth password:', authError);
      // Don't fail the operation - database password is updated
    }
  } else {
    // User doesn't have Supabase Auth account - create one
    try {
      const { data: authData } = await supabase.auth.admin.createUser({
        email: normalizedEmail,
        password: newPassword,
        email_confirm: true,
        user_metadata: {
          first_name: user.first_name,
          last_name: user.last_name,
        },
      });
      if (authData?.user) {
        await UserRepository.update(user.user_id, { auth_user_id: authData.user.id });
      }
    } catch (authError) {
      console.error('Failed to create Supabase Auth user during password reset:', authError);
    }
  }
}
