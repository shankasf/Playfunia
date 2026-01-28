import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { Session } from '@supabase/supabase-js';

import { supabase } from '../lib/supabase';
import { apiGet, apiPost, setAuthToken, apiPostPublic } from '../api/client';

// Role definitions matching backend
export const ROLES = {
  CUSTOMER: 'customer',  // Regular users who book parties, buy tickets
  EMPLOYEE: 'employee',  // Staff who check in members, redeem tickets, view dashboard
  ADMIN: 'admin',        // Full system access, manage users, content, pricing
} as const;

export type UserRole = typeof ROLES[keyof typeof ROLES];

type MembershipStatus = {
  membershipId?: string;
  tierName?: string;
  startedAt?: string;
  expiresAt?: string;
  autoRenew?: boolean;
  visitsPerMonth?: number | null;
  visitsUsed?: number;
  visitsRemaining?: number | null;
  visitPeriodStart?: string;
  lastVisitAt?: string;
};

export type ChildProfile = {
  id: string;
  firstName: string;
  lastName?: string;
  birthDate?: string;
};

type User = {
  id: string;
  firstName: string;
  lastName?: string;
  email: string;
  phone?: string;
  roles: string[];
  membership?: MembershipStatus;
  children: ChildProfile[];
  hasValidWaiver?: boolean;
  createdAt?: string;
};

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  isLoading: boolean;
  // Email/Password methods
  signInWithEmail: (email: string, password: string) => Promise<void>;
  signUpWithEmail: (input: {
    firstName: string;
    lastName: string;
    email: string;
    password: string;
    phone?: string;
  }) => Promise<{ success: boolean; message: string; requiresVerification: boolean }>;
  verifyRegistrationOTP: (email: string, otp: string, password?: string) => Promise<{ success: boolean; message: string; needsSignIn?: boolean }>;
  // Magic Link (OTP) method
  signInWithMagicLink: (email: string) => Promise<{ success: boolean; message: string }>;
  // Google OAuth
  signInWithGoogle: () => Promise<void>;
  signUpWithGoogle: () => Promise<void>;
  // Password reset (using backend API with AWS SES)
  sendPasswordResetOTP: (email: string) => Promise<{ success: boolean; message: string }>;
  verifyPasswordResetOTP: (email: string, otp: string) => Promise<{ success: boolean; message: string }>;
  resetPasswordWithOTP: (email: string, otp: string, newPassword: string) => Promise<{ success: boolean; message: string }>;
  // Legacy password reset (kept for compatibility)
  resetPassword: (email: string) => Promise<{ success: boolean; message: string }>;
  updatePassword: (newPassword: string) => Promise<void>;
  // Session management
  logout: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  // Role helpers
  hasRole: (role: string) => boolean;
  isAdmin: boolean;
  isEmployee: boolean;
  isCustomer: boolean;
  isTeamMember: boolean;  // Admin or Employee
  // Legacy aliases (for backward compatibility)
  isStaff: boolean;       // Alias for isEmployee
  // Legacy methods for backward compatibility during transition
  login: (email: string, password: string) => Promise<void>;
  register: (input: {
    firstName: string;
    lastName: string;
    email: string;
    password: string;
    phone?: string;
  }) => Promise<{ success: boolean; message: string; requiresVerification: boolean }>;
  token: string | null;
  // Auth error message (e.g., when sign-in fails for new users)
  authError: string | null;
  clearAuthError: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);

  // Load user profile from backend
  const loadProfile = useCallback(async (accessToken: string) => {
    try {
      setAuthToken(accessToken);
      const response = await apiGet<{ user: unknown }>('/users/me');
      setUser(normalizeUser(response.user));
      // Clear any OAuth flow flags on successful profile load
      localStorage.removeItem('playfunia_oauth_flow');
    } catch (error) {
      console.warn('Unable to load profile, trying to sync...', error);

      // Check if this is a sign-up flow (allows creating new users)
      const oauthFlow = localStorage.getItem('playfunia_oauth_flow');
      const isSignUpFlow = oauthFlow === 'signup';

      // Clear the flag
      localStorage.removeItem('playfunia_oauth_flow');

      if (!isSignUpFlow) {
        // Sign-in flow: don't create new users, show error
        setAuthError('No account found with this email. Please sign up first.');
        setUser(null);
        // Sign out from Supabase since they don't have an account
        await supabase.auth.signOut();
        return;
      }

      // Sign-up flow: try to load profile with retry (user may have just been created)
      try {
        // Small delay to allow database to fully commit the user record
        await new Promise(resolve => setTimeout(resolve, 500));

        // Try loading profile again
        const retryResponse = await apiGet<{ user: unknown }>('/users/me');
        setUser(normalizeUser(retryResponse.user));
      } catch (retryError) {
        // If still failing, try the sync endpoint as last resort
        console.warn('Profile load retry failed, attempting sync...', retryError);
        try {
          await apiPost('/auth/sync-profile-signup', {});
          const syncResponse = await apiGet<{ user: unknown }>('/users/me');
          setUser(normalizeUser(syncResponse.user));
        } catch (syncError) {
          console.error('Failed to sync profile', syncError);
          setUser(null);
        }
      }
    }
  }, []);

  // Initialize auth state
  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session: initialSession } }) => {
      setSession(initialSession);
      if (initialSession?.access_token) {
        loadProfile(initialSession.access_token).finally(() => setIsLoading(false));
      } else {
        setIsLoading(false);
      }
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, newSession) => {
        setSession(newSession);

        if (newSession?.access_token) {
          setAuthToken(newSession.access_token);
          await loadProfile(newSession.access_token);
        } else {
          setAuthToken(null);
          setUser(null);
        }
      }
    );

    return () => subscription.unsubscribe();
  }, [loadProfile]);

  // Sign in with email/password
  const signInWithEmail = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) throw new Error(error.message);
  }, []);

  // Sign up with email/password - Step 1: Send OTP (account created only after verification)
  const signUpWithEmail = useCallback(async (input: {
    firstName: string;
    lastName: string;
    email: string;
    password: string;
    phone?: string;
  }): Promise<{ success: boolean; message: string; requiresVerification: boolean }> => {
    try {
      const result = await apiPostPublic<{ success: boolean; message: string; emailVerificationRequired?: boolean }, typeof input>(
        '/auth/register',
        input
      );
      return {
        success: result.success,
        message: result.message,
        requiresVerification: result.emailVerificationRequired ?? true,
      };
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : 'Registration failed');
    }
  }, []);

  // Verify registration OTP - Step 2: Creates account after verification
  // Password is passed to sign in with Supabase after account creation
  const verifyRegistrationOTP = useCallback(async (email: string, otp: string, password?: string): Promise<{ success: boolean; message: string; needsSignIn?: boolean }> => {
    try {
      const result = await apiPostPublic<{ success: boolean; message: string; token?: string; user?: unknown }, { email: string; otp: string; type: string }>(
        '/auth/verify-otp',
        { email, otp, type: 'email_verification' }
      );

      if (!result.success) {
        return { success: false, message: result.message };
      }

      // Account created - now sign in with Supabase to get a proper session
      if (password) {
        try {
          // Set flag to indicate this is a fresh registration sign-in
          // This prevents loadProfile from signing out if there's a brief sync delay
          localStorage.setItem('playfunia_oauth_flow', 'signup');
          const { error } = await supabase.auth.signInWithPassword({ email, password });
          if (error) {
            localStorage.removeItem('playfunia_oauth_flow');
            // Account created but couldn't auto-sign in
            return { success: true, message: 'Account created! Please sign in.', needsSignIn: true };
          }
          // Successfully signed in - session will be picked up by onAuthStateChange
          return { success: true, message: result.message };
        } catch {
          localStorage.removeItem('playfunia_oauth_flow');
          return { success: true, message: 'Account created! Please sign in.', needsSignIn: true };
        }
      }

      return { success: true, message: result.message, needsSignIn: true };
    } catch (error) {
      return { success: false, message: error instanceof Error ? error.message : 'Failed to verify code' };
    }
  }, []);

  // Sign in with magic link (OTP)
  const signInWithMagicLink = useCallback(async (email: string) => {
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });
    if (error) {
      return { success: false, message: error.message };
    }
    return { success: true, message: 'Check your email for a sign-in link!' };
  }, []);

  // Sign in with Google (existing users only)
  const signInWithGoogle = useCallback(async () => {
    // Set flag to indicate this is a sign-in flow (not sign-up)
    localStorage.setItem('playfunia_oauth_flow', 'signin');
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });
    if (error) {
      localStorage.removeItem('playfunia_oauth_flow');
      throw new Error(error.message);
    }
  }, []);

  // Sign up with Google (creates new account with Google profile name)
  const signUpWithGoogle = useCallback(async () => {
    // Set flag to indicate this is a sign-up flow (allows creating new users)
    localStorage.setItem('playfunia_oauth_flow', 'signup');
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });
    if (error) {
      localStorage.removeItem('playfunia_oauth_flow');
      throw new Error(error.message);
    }
  }, []);

  // Send password reset OTP via backend API (uses AWS SES)
  const sendPasswordResetOTP = useCallback(async (email: string) => {
    try {
      const result = await apiPostPublic<{ success: boolean; message: string }, { email: string; type: string }>(
        '/auth/send-otp',
        { email, type: 'password_reset' }
      );
      return result;
    } catch (error) {
      return { success: false, message: error instanceof Error ? error.message : 'Failed to send reset code' };
    }
  }, []);

  // Verify password reset OTP
  const verifyPasswordResetOTP = useCallback(async (email: string, otp: string) => {
    try {
      const result = await apiPostPublic<{ success: boolean; message: string }, { email: string; otp: string; type: string }>(
        '/auth/verify-otp',
        { email, otp, type: 'password_reset' }
      );
      return result;
    } catch (error) {
      return { success: false, message: error instanceof Error ? error.message : 'Failed to verify code' };
    }
  }, []);

  // Reset password with OTP via backend API
  const resetPasswordWithOTP = useCallback(async (email: string, otp: string, newPassword: string) => {
    try {
      const result = await apiPostPublic<{ success: boolean; message: string }, { email: string; otp: string; newPassword: string }>(
        '/auth/reset-password',
        { email, otp, newPassword }
      );
      return result;
    } catch (error) {
      return { success: false, message: error instanceof Error ? error.message : 'Failed to reset password' };
    }
  }, []);

  // Legacy reset password - now uses backend API with OTP
  const resetPassword = useCallback(async (email: string) => {
    return sendPasswordResetOTP(email);
  }, [sendPasswordResetOTP]);

  // Update password (for logged in users via Supabase)
  const updatePassword = useCallback(async (newPassword: string) => {
    const { error } = await supabase.auth.updateUser({
      password: newPassword,
    });
    if (error) throw new Error(error.message);
  }, []);

  // Logout
  const logout = useCallback(async () => {
    await supabase.auth.signOut();
    setSession(null);
    setUser(null);
    setAuthToken(null);
    localStorage.removeItem('playfunia_waiver_auth');
  }, []);

  const refreshProfile = useCallback(async () => {
    if (session?.access_token) {
      await loadProfile(session.access_token);
    }
  }, [session, loadProfile]);

  const hasRole = useCallback((role: string) => {
    return user?.roles.includes(role) ?? false;
  }, [user]);

  // New role checks
  const isAdmin = hasRole(ROLES.ADMIN);
  const isEmployee = hasRole(ROLES.EMPLOYEE) || hasRole('staff'); // Support legacy 'staff' role
  const isCustomer = hasRole(ROLES.CUSTOMER) || hasRole('user');  // Support legacy 'user' role
  const isTeamMember = isAdmin || isEmployee;
  // Legacy alias
  const isStaff = isEmployee;

  // Legacy methods for backward compatibility
  const login = signInWithEmail;
  const register = signUpWithEmail;
  const token = session?.access_token ?? null;

  // Clear auth error
  const clearAuthError = useCallback(() => {
    setAuthError(null);
  }, []);

  const value = useMemo<AuthContextValue>(() => ({
    user,
    session,
    isLoading,
    signInWithEmail,
    signUpWithEmail,
    verifyRegistrationOTP,
    signInWithMagicLink,
    signInWithGoogle,
    signUpWithGoogle,
    sendPasswordResetOTP,
    verifyPasswordResetOTP,
    resetPasswordWithOTP,
    resetPassword,
    updatePassword,
    logout,
    refreshProfile,
    hasRole,
    isAdmin,
    isEmployee,
    isCustomer,
    isTeamMember,
    isStaff, // Legacy alias
    // Legacy
    login,
    register,
    token,
    // Auth error
    authError,
    clearAuthError,
  }), [
    user, session, isLoading,
    signInWithEmail, signUpWithEmail, verifyRegistrationOTP, signInWithMagicLink, signInWithGoogle, signUpWithGoogle,
    sendPasswordResetOTP, verifyPasswordResetOTP, resetPasswordWithOTP,
    resetPassword, updatePassword, logout, refreshProfile,
    hasRole, isAdmin, isEmployee, isCustomer, isTeamMember, isStaff,
    login, register, token, authError, clearAuthError,
  ]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
}

function normalizeUser(raw: unknown): User {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Unexpected user payload');
  }

  const data = raw as Record<string, unknown>;

  const id = typeof data.id === 'string' ? data.id : typeof data._id === 'string' ? data._id : '';
  const firstName = typeof data.firstName === 'string' ? data.firstName : '';
  const lastName = typeof data.lastName === 'string' ? data.lastName : undefined;
  const email = typeof data.email === 'string' ? data.email : '';
  const phone = typeof data.phone === 'string' ? data.phone : undefined;
  const rawRoles = Array.isArray(data.roles)
    ? data.roles
    : typeof data.role === 'string'
      ? [data.role]
      : [];
  const roles = rawRoles
    .filter((role) => typeof role === 'string')
    .map((role) => (role as string).trim().toLowerCase())
    .filter((role) => role.length > 0) as string[];

  const membershipSource = data.membership as Record<string, unknown> | undefined;
  const membership: MembershipStatus | undefined = membershipSource
    ? {
      membershipId:
        typeof membershipSource.membershipId === 'string'
          ? membershipSource.membershipId
          : typeof membershipSource.id === 'string'
            ? membershipSource.id
            : undefined,
      tierName:
        typeof membershipSource.tierName === 'string' ? membershipSource.tierName : undefined,
      startedAt: toIsoString(membershipSource.startedAt),
      expiresAt: toIsoString(membershipSource.expiresAt),
      autoRenew:
        typeof membershipSource.autoRenew === 'boolean' ? membershipSource.autoRenew : undefined,
      visitsPerMonth: normalizeNumber(membershipSource.visitsPerMonth),
      visitsUsed:
        normalizeNumber(membershipSource.visitsUsed ?? membershipSource.visitsUsedThisPeriod) ??
        0,
      visitsRemaining: normalizeNumber(membershipSource.visitsRemaining),
      visitPeriodStart: toIsoString(membershipSource.visitPeriodStart),
      lastVisitAt: toIsoString(membershipSource.lastVisitAt),
    }
    : undefined;

  const childrenSource = Array.isArray(data.children) ? data.children : [];
  const children = childrenSource.reduce<ChildProfile[]>((acc, child) => {
    if (!child || typeof child !== 'object') {
      return acc;
    }
    const childRecord = child as Record<string, unknown>;
    const rawId = childRecord.id ?? childRecord._id;
    const childId =
      typeof rawId === 'string'
        ? rawId
        : typeof rawId === 'number'
          ? String(rawId)
          : null;
    if (!childId) {
      return acc;
    }

    acc.push({
      id: childId,
      firstName: typeof childRecord.firstName === 'string' ? childRecord.firstName : '',
      lastName: typeof childRecord.lastName === 'string' ? childRecord.lastName : undefined,
      birthDate: toIsoString(childRecord.birthDate),
    });
    return acc;
  }, []);

  return {
    id,
    phone,
    firstName,
    lastName,
    email,
    roles,
    membership,
    children,
    hasValidWaiver: typeof data.hasValidWaiver === 'boolean' ? data.hasValidWaiver : false,
    createdAt: toIsoString(data.createdAt),
  };
}

function normalizeNumber(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isNaN(parsed) ? undefined : parsed;
  }
  return undefined;
}

function toIsoString(value: unknown) {
  if (typeof value === 'string') {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  return undefined;
}
