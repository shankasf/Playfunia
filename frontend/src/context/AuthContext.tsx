import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { Session } from '@supabase/supabase-js';

import { supabase } from '../lib/supabase';
import { apiGet, apiPost, setAuthToken } from '../api/client';

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
  }) => Promise<void>;
  // Magic Link (OTP) method
  signInWithMagicLink: (email: string) => Promise<{ success: boolean; message: string }>;
  // Google OAuth
  signInWithGoogle: () => Promise<void>;
  // Password reset
  resetPassword: (email: string) => Promise<{ success: boolean; message: string }>;
  updatePassword: (newPassword: string) => Promise<void>;
  // Session management
  logout: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  // Role helpers
  hasRole: (role: string) => boolean;
  isAdmin: boolean;
  isStaff: boolean;
  isTeamMember: boolean;
  // Legacy methods for backward compatibility during transition
  login: (email: string, password: string) => Promise<void>;
  register: (input: {
    firstName: string;
    lastName: string;
    email: string;
    password: string;
    phone?: string;
  }) => Promise<void>;
  token: string | null;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Load user profile from backend
  const loadProfile = useCallback(async (accessToken: string) => {
    try {
      setAuthToken(accessToken);
      const response = await apiGet<{ user: unknown }>('/users/me');
      setUser(normalizeUser(response.user));
    } catch (error) {
      console.warn('Unable to load profile, trying to sync...', error);
      // Profile doesn't exist yet, sync it
      try {
        await apiPost('/auth/sync-profile', {});
        const retryResponse = await apiGet<{ user: unknown }>('/users/me');
        setUser(normalizeUser(retryResponse.user));
      } catch (syncError) {
        console.error('Failed to sync profile', syncError);
        setUser(null);
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

  // Sign up with email/password
  const signUpWithEmail = useCallback(async (input: {
    firstName: string;
    lastName: string;
    email: string;
    password: string;
    phone?: string;
  }) => {
    const { error } = await supabase.auth.signUp({
      email: input.email,
      password: input.password,
      options: {
        data: {
          first_name: input.firstName,
          last_name: input.lastName,
          phone: input.phone,
        },
      },
    });
    if (error) throw new Error(error.message);
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

  // Sign in with Google
  const signInWithGoogle = useCallback(async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });
    if (error) throw new Error(error.message);
  }, []);

  // Reset password
  const resetPassword = useCallback(async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/reset-password`,
    });
    if (error) {
      return { success: false, message: error.message };
    }
    return { success: true, message: 'Password reset email sent!' };
  }, []);

  // Update password
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

  const isAdmin = hasRole('admin');
  const isStaff = hasRole('staff');
  const isTeamMember = isAdmin || isStaff;

  // Legacy methods for backward compatibility
  const login = signInWithEmail;
  const register = signUpWithEmail;
  const token = session?.access_token ?? null;

  const value = useMemo<AuthContextValue>(() => ({
    user,
    session,
    isLoading,
    signInWithEmail,
    signUpWithEmail,
    signInWithMagicLink,
    signInWithGoogle,
    resetPassword,
    updatePassword,
    logout,
    refreshProfile,
    hasRole,
    isAdmin,
    isStaff,
    isTeamMember,
    // Legacy
    login,
    register,
    token,
  }), [
    user, session, isLoading,
    signInWithEmail, signUpWithEmail, signInWithMagicLink, signInWithGoogle,
    resetPassword, updatePassword, logout, refreshProfile,
    hasRole, isAdmin, isStaff, isTeamMember,
    login, register, token,
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
