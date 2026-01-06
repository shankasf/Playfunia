import { API_BASE_URL, apiGet, apiPatch, apiPost } from './client';

export type AdminSummary = {
  generatedAt: string;
  bookings: {
    upcoming: Array<{
      id: string;
      reference: string;
      location: string;
      eventDate: string;
      startTime: string;
      status: string;
      guardian?: { firstName?: string; lastName?: string };
    }>;
    pendingDepositCount: number;
  };
  waivers: {
    total: number;
    recent: Array<{ id: string; guardianName: string; signedAt: string; marketingOptIn: boolean }>;
  };
  tickets: {
    salesToday: number;
    redeemedToday: number;
    unusedCodes: number;
    salesWeek: number;
  };
  memberships: {
    activeMembers: number;
    visitsToday: number;
  };
};

export type AdminBooking = {
  id: string;
  reference: string;
  location: string;
  eventDate: string;
  startTime: string;
  endTime: string;
  status: 'Pending' | 'Confirmed' | 'Cancelled';
  paymentStatus: 'awaiting_deposit' | 'deposit_paid' | string;
  depositAmount: number;
  balanceRemaining: number;
  notes: string | null;
  guardian?: { firstName?: string; lastName?: string; email?: string; phone?: string } | null;
  partyPackage?: { id?: string; name?: string } | null;
};

export type AdminBookingUpdatePayload = Partial<{
  status: 'Pending' | 'Confirmed' | 'Cancelled';
  eventDate: string;
  startTime: string;
  location: string;
  notes: string;
}>;

export type AdminTicketLogEntry = {
  id: string;
  guardian?: { firstName?: string; lastName?: string; email?: string } | null;
  type: string;
  quantity: number;
  total: number;
  createdAt: string;
  codes: Array<{ code: string; status: 'unused' | 'redeemed'; redeemedAt?: string }>;
};

export type AdminMembership = {
  userId: string;
  firstName: string;
  lastName?: string;
  email?: string;
  membership: {
    membershipId: string | null;
    tierName: string;
    autoRenew: boolean;
    visitsPerMonth: number | null;
    visitsUsed: number;
    visitsRemaining: number | null;
    visitPeriodStart?: string;
    lastVisitAt?: string;
    discountPercent?: number;
    guestPassesPerMonth?: number;
  } | null;
};

export type AdminWaiver = {
  id: string;
  // New schema fields
  guardianFirstName?: string;
  guardianLastName?: string;
  relationshipToMinor?: string;
  digitalSignature?: string;
  marketingSmsOptIn?: boolean;
  marketingEmailOptIn?: boolean;
  // Backward compatible fields
  guardianName: string;
  guardianEmail: string;
  guardianPhone: string;
  guardianDateOfBirth?: string;
  relationshipToChildren?: string;
  guardian?: { firstName?: string; lastName?: string; email?: string; phone?: string } | null;
  children: Array<{ name?: string; first_name?: string; last_name?: string; birthDate?: string; birth_date?: string; gender?: string }>;
  signedAt: string;
  expiresAt?: string;
  marketingOptIn: boolean;
  visitCount?: number;
};

export type AdminWaiverUpdatePayload = Partial<{
  guardianFirstName: string | null;
  guardianLastName: string | null;
  guardianEmail: string | null;
  guardianPhone: string | null;
  guardianDateOfBirth: string | null;
  relationshipToMinor: string | null;
  marketingSmsOptIn: boolean;
  marketingEmailOptIn: boolean;
  expiresAt: string | null;
  marketingOptIn: boolean;
  children: Array<{ name: string; birthDate: string }>;
}>;

export type AdminEventPayload = {
  type: string;
  payload?: unknown;
  timestamp: string;
};

export async function fetchAdminSummary() {
  return apiGet<AdminSummary>('/admin/summary');
}

export async function fetchAdminBookings(
  filters?: Partial<{ status: string; location: string; dateFrom: string; dateTo: string }>
) {
  const params = new URLSearchParams();
  if (filters?.status) params.set('status', filters.status);
  if (filters?.location) params.set('location', filters.location);
  if (filters?.dateFrom) params.set('dateFrom', filters.dateFrom);
  if (filters?.dateTo) params.set('dateTo', filters.dateTo);

  const query = params.toString();
  const response = await apiGet<{ bookings: AdminBooking[] }>(
    `/admin/bookings${query ? `?${query}` : ''}`
  );
  return response.bookings;
}

export async function updateAdminBooking(bookingId: string, payload: AdminBookingUpdatePayload) {
  const response = await apiPatch<{ booking: AdminBooking }, AdminBookingUpdatePayload>(
    `/admin/bookings/${bookingId}`,
    payload
  );
  return response.booking;
}

export async function cancelAdminBooking(bookingId: string, reason?: string) {
  const response = await apiPost<{ booking: AdminBooking }, { reason?: string }>(
    `/admin/bookings/${bookingId}/cancel`,
    { reason }
  );
  return response.booking;
}

export async function fetchAdminWaivers(limit?: number) {
  const query = typeof limit === 'number' ? `?limit=${limit}` : '';
  const response = await apiGet<{ waivers: AdminWaiver[] }>(`/admin/waivers${query}`);
  return response.waivers;
}

export async function updateAdminWaiverSubmission(waiverId: string, payload: AdminWaiverUpdatePayload) {
  const response = await apiPatch<{ waiver: AdminWaiver }, AdminWaiverUpdatePayload>(
    `/admin/waivers/${waiverId}`,
    payload,
  );
  return response.waiver;
}

export async function deleteAdminWaiverSubmission(waiverId: string) {
  const response = await fetch(`${API_BASE_URL}/admin/waivers/${waiverId}`, {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${localStorage.getItem('token') ?? ''}`,
    },
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message ?? 'Failed to delete waiver');
  }
  return { success: true };
}

export async function fetchAdminTicketLog() {
  const response = await apiGet<{ tickets: AdminTicketLogEntry[] }>('/admin/tickets/log');
  return response.tickets;
}

export async function redeemTicketCode(code: string) {
  const response = await apiPost<{ ticket: AdminTicketLogEntry }, { code: string }>(
    `/admin/tickets/redeem`,
    { code }
  );
  return response.ticket;
}

export async function fetchAdminMemberships() {
  const response = await apiGet<{ memberships: AdminMembership[] }>('/admin/memberships');
  return response.memberships;
}

export type AdminMembershipUpdatePayload = {
  tier?: string;
  auto_renew?: boolean;
  visits_used_this_period?: number;
  status?: 'active' | 'cancelled' | 'expired';
};

export async function updateAdminMembership(membershipId: string, payload: AdminMembershipUpdatePayload) {
  const response = await apiPatch<{ membership: unknown }, AdminMembershipUpdatePayload>(
    `/admin/memberships/${membershipId}`,
    payload
  );
  return response.membership;
}

export async function recordAdminMembershipVisit(membershipId: string) {
  const response = await apiPost<
    { 
      membershipId: number; 
      membership: NonNullable<AdminMembership['membership']>;
    },
    Record<string, never>
  >(`/admin/memberships/${membershipId}/visit`, {} as Record<string, never>);
  return response.membership;
}

export type MembershipValidationResult = {
  userId: string;
  membership: {
    tierName?: string;
    autoRenew?: boolean;
    visitsPerMonth?: number | null;
    visitsUsed: number;
    visitPeriodStart?: string;
    lastVisitAt?: string;
  } | null;
};

export async function validateMembershipEntry(lookup: string) {
  return apiPost<MembershipValidationResult, { lookup: string }>(`/admin/memberships/validate`, {
    lookup,
  });
}

export function createAdminEventSource(token: string) {
  const url = new URL(`${API_BASE_URL}/admin/stream`);
  if (token) {
    url.searchParams.set('token', token);
  }
  return new EventSource(url.toString());
}
