import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

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

type AuthResponse = {
  token: string;
  user: unknown;
};

interface AuthContextValue {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (input: {
    firstName: string;
    lastName: string;
    email: string;
    password: string;
    phone?: string;
  }) => Promise<void>;
  logout: () => void;
  refreshProfile: () => Promise<void>;
  hasRole: (role: string) => boolean;
  isAdmin: boolean;
  isStaff: boolean;
  isTeamMember: boolean;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);
const STORAGE_KEY = 'playfunia_token';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const loadProfile = useCallback(async (authToken: string) => {
    try {
      const response = await apiGet<{ user: unknown }>('/users/me', {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      setUser(normalizeUser(response.user));
    } catch (error) {
      console.warn('Unable to refresh profile', error);
      setUser(null);
      setAuthToken(null);
      localStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      setToken(stored);
      setAuthToken(stored);
      loadProfile(stored).finally(() => setIsLoading(false));
    } else {
      setIsLoading(false);
    }
  }, [loadProfile]);

  const persistAuth = useCallback(
    async (data: AuthResponse) => {
      setToken(data.token);
      setUser(normalizeUser(data.user));
      localStorage.setItem(STORAGE_KEY, data.token);
      setAuthToken(data.token);
      try {
        await loadProfile(data.token);
      } catch (error) {
        console.warn('Unable to refresh profile after authentication', error);
      }
    },
    [loadProfile]
  );

  const refreshProfile = useCallback(async () => {
    const activeToken = token ?? localStorage.getItem(STORAGE_KEY);
    if (!activeToken) {
      return;
    }
    await loadProfile(activeToken);
  }, [token, loadProfile]);

  const login = useCallback(
    async (email: string, password: string) => {
      const result = await apiPost<AuthResponse, { email: string; password: string }>(
        '/auth/login',
        {
          email,
          password,
        }
      );
      await persistAuth(result);
    },
    [persistAuth]
  );

  const register = useCallback(
    async (input: {
      firstName: string;
      lastName: string;
      email: string;
      password: string;
      phone?: string;
    }) => {
      const result = await apiPost<AuthResponse, typeof input>('/auth/register', input);
      await persistAuth(result);
    },
    [persistAuth]
  );

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
    localStorage.removeItem(STORAGE_KEY);
    // Also clear waiver auth when main auth logs out
    localStorage.removeItem('playfunia_waiver_auth');
    setAuthToken(null);
  }, []);

  const hasRole = useCallback(
    (role: string) => {
      if (!user) return false;
      return user.roles.includes(role);
    },
    [user]
  );

  const isAdmin = hasRole('admin');
  const isStaff = hasRole('staff');
  const isTeamMember = isAdmin || isStaff;

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      token,
      isLoading,
      login,
      register,
      logout,
      refreshProfile,
      hasRole,
      isAdmin,
      isStaff,
      isTeamMember,
    }),
    [
      user,
      token,
      isLoading,
      login,
      register,
      logout,
      refreshProfile,
      hasRole,
      isAdmin,
      isStaff,
      isTeamMember,
    ]
  );

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
