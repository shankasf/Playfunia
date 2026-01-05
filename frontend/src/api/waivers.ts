import { apiGet } from './client';

export type WaiverChild = {
  name: string;
  birthDate: string;
  gender?: string;
};

export type GuardianWaiver = {
  id: string;
  guardianName: string | null;
  guardianEmail: string | null;
  guardianPhone: string | null;
  guardianDateOfBirth: string | null;
  relationshipToChildren: string | null;
  allergies: string;
  medicalNotes: string;
  insuranceProvider: string;
  insurancePolicyNumber: string;
  children: WaiverChild[];
  signature: string | null;
  signedAt: string;
  expiresAt: string | null;
  marketingOptIn: boolean;
  acceptedPolicies: string[];
};

type GuardianWaiverApi = Omit<GuardianWaiver, 'id'> & {
  _id?: string;
  id?: string;
};

export async function fetchMyWaivers() {
  const response = await apiGet<{ waivers: GuardianWaiverApi[] }>('/waivers');
  return response.waivers.map(({ _id, id, ...rest }) => ({
    id: id ?? _id ?? crypto.randomUUID?.() ?? Math.random().toString(36).slice(2, 10),
    ...rest,
  }));
}
