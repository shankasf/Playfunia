import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { lookupWaiverAuth, loginWaiverUser, type WaiverAuthResult, type WaiverChild } from '../api/waiver-auth';
import { setWaiverAuthToken } from '../api/client';

/**
 * Check if a JWT token is expired
 */
function isTokenExpired(token: string): boolean {
    try {
        const parts = token.split('.');
        if (parts.length !== 3) return true;
        const payload = JSON.parse(atob(parts[1]));
        if (!payload.exp) return false; // No expiry set
        return Date.now() >= payload.exp * 1000;
    } catch {
        return true; // Invalid token
    }
}

type WaiverUser = {
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

type WaiverAuthContextValue = {
    waiverUser: WaiverUser | null;
    waiverToken: string | null;
    isWaiverAuthenticated: boolean;
    isLoading: boolean;
    error: string | null;

    /**
     * Lookup email/phone to determine next step:
     * - 'main_user': should redirect to main login
     * - 'waiver_user': will auto-login
     * - 'not_found': will create new waiver user
     */
    lookup: (input: { email?: string; phone?: string }) => Promise<'main_user' | 'waiver_user' | 'not_found'>;

    /**
     * Login or register as waiver-only user
     */
    loginOrRegister: (input: { email?: string; phone?: string }) => Promise<WaiverAuthResult>;

    /**
     * Clear waiver auth session
     */
    logout: () => void;

    /**
     * Mark the current waiver user as having completed their waiver
     */
    markWaiverCompleted: () => void;
};

const WaiverAuthContext = createContext<WaiverAuthContextValue | null>(null);

const STORAGE_KEY = 'playfunia_waiver_auth';

type StoredWaiverAuth = {
    token: string;
    waiverUser: WaiverUser;
};

export function WaiverAuthProvider({ children }: { children: ReactNode }) {
    const [waiverUser, setWaiverUser] = useState<WaiverUser | null>(null);
    const [waiverToken, setWaiverToken] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Load from storage on mount
    useEffect(() => {
        try {
            const stored = localStorage.getItem(STORAGE_KEY);
            if (stored) {
                const parsed: StoredWaiverAuth = JSON.parse(stored);
                if (parsed.token && parsed.waiverUser) {
                    // Check if token is expired
                    if (isTokenExpired(parsed.token)) {
                        // Clear expired token
                        localStorage.removeItem(STORAGE_KEY);
                    } else {
                        setWaiverToken(parsed.token);
                        // Always reset hasCompletedWaiver to false on page load
                        // Each visit requires a new waiver signature
                        setWaiverUser({ ...parsed.waiverUser, hasCompletedWaiver: false });
                        setWaiverAuthToken(parsed.token);
                    }
                }
            }
        } catch {
            // ignore parse errors, clear corrupted storage
            localStorage.removeItem(STORAGE_KEY);
        }
        setIsLoading(false);
    }, []);

    const saveToStorage = useCallback((token: string, user: WaiverUser) => {
        const data: StoredWaiverAuth = { token, waiverUser: user };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
        setWaiverAuthToken(token);
    }, []);

    const clearStorage = useCallback(() => {
        localStorage.removeItem(STORAGE_KEY);
        setWaiverAuthToken(null);
    }, []);

    const lookup = useCallback(async (input: { email?: string; phone?: string }) => {
        setError(null);
        try {
            const result = await lookupWaiverAuth(input);
            return result.status;
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Lookup failed';
            setError(message);
            throw err;
        }
    }, []);

    const loginOrRegister = useCallback(
        async (input: { email?: string; phone?: string }) => {
            setError(null);
            setIsLoading(true);
            try {
                const result = await loginWaiverUser(input);
                setWaiverToken(result.token);
                setWaiverUser(result.waiverUser);
                saveToStorage(result.token, result.waiverUser);
                return result;
            } catch (err) {
                const message = err instanceof Error ? err.message : 'Login failed';
                setError(message);
                throw err;
            } finally {
                setIsLoading(false);
            }
        },
        [saveToStorage],
    );

    const logout = useCallback(() => {
        setWaiverToken(null);
        setWaiverUser(null);
        clearStorage();
    }, [clearStorage]);

    const markWaiverCompleted = useCallback(() => {
        if (waiverUser && waiverToken) {
            const updatedUser = { ...waiverUser, hasCompletedWaiver: true };
            setWaiverUser(updatedUser);
            saveToStorage(waiverToken, updatedUser);
        }
    }, [waiverUser, waiverToken, saveToStorage]);

    const value: WaiverAuthContextValue = {
        waiverUser,
        waiverToken,
        isWaiverAuthenticated: Boolean(waiverToken && waiverUser),
        isLoading,
        error,
        lookup,
        loginOrRegister,
        logout,
        markWaiverCompleted,
    };

    return <WaiverAuthContext.Provider value={value}>{children}</WaiverAuthContext.Provider>;
}

export function useWaiverAuth() {
    const context = useContext(WaiverAuthContext);
    if (!context) {
        throw new Error('useWaiverAuth must be used within WaiverAuthProvider');
    }
    return context;
}
