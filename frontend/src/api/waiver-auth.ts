import { apiPost } from './client';

export type WaiverLookupResult = {
  status: 'main_user' | 'waiver_user' | 'not_found';
  email?: string;
  phone?: string;
};

export type WaiverAuthResult = {
  token: string;
  isNewUser: boolean;
  waiverUser: {
    id: string;
    email?: string;
    phone?: string;
    guardianName?: string;
    hasCompletedWaiver: boolean;
  };
};

/**
 * Lookup email/phone to see if it exists in main user DB or waiver user DB
 */
export async function lookupWaiverAuth(input: { email?: string; phone?: string }) {
  return apiPost<WaiverLookupResult, typeof input>('/waiver-auth/lookup', input);
}

/**
 * Login or register as a waiver-only user (no password)
 */
export async function loginWaiverUser(input: { email?: string; phone?: string }) {
  return apiPost<WaiverAuthResult, typeof input>('/waiver-auth/login', input);
}
