import { API_BASE_URL, apiDelete, apiGet, apiPatch, apiPost, getAuthToken } from './client';

export type AdminSummary = {
  generatedAt: string;
  bookings: {
    total: number;
    today: number;
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
    today: number;
    recent: Array<{ id: string; guardianName: string; signedAt: string; marketingOptIn: boolean }>;
  };
  tickets: {
    totalRevenue: number;
    todayRevenue: number;
    totalPurchases: number;
    todayPurchases: number;
    salesToday: number;
    redeemedToday: number;
    unusedCodes: number;
    salesWeek: number;
  };
  memberships: {
    total: number;
    activeMembers: number;
    visitsToday: number;
  };
  applicants?: {
    total: number;
    pendingCount: number;
  };
  events?: {
    total: number;
    today: number;
  };
};

export type AdminBooking = {
  id: string;
  reference: string;
  location: string;
  eventDate: string;
  startTime: string;
  endTime: string;
  guests: number;
  total: number;
  status: 'Pending' | 'Confirmed' | 'Cancelled';
  paymentStatus: 'awaiting_deposit' | 'awaiting_full_payment' | 'deposit_paid' | 'paid' | string;
  depositAmount: number;
  balanceRemaining: number;
  notes: string | null;
  privateNotes: string | null;
  guardian?: { firstName?: string; lastName?: string; email?: string; phone?: string } | null;
  partyPackage?: { id?: string; name?: string } | null;
  // Partial payment tracking
  paymentOption?: 'full' | 'split';
  onlinePaymentAmount?: number;
  venuePaymentAmount?: number;
  // Guest info (for guest bookings without customer account)
  guestName?: string | null;
  guestEmail?: string | null;
  guestPhone?: string | null;
};

export type AdminBookingUpdatePayload = Partial<{
  status: 'Pending' | 'Confirmed' | 'Cancelled';
  eventDate: string;
  startTime: string;
  location: string;
  notes: string;
  privateNotes: string;
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
    status: 'active' | 'cancelled' | 'expired';
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

export async function deleteAdminBooking(bookingId: string) {
  return apiDelete<{ success: boolean }>(`/admin/bookings/${bookingId}`);
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
  return apiDelete<{ success: boolean }>(`/admin/waivers/${waiverId}`);
}

export async function fetchAdminTicketLog() {
  const response = await apiGet<{ tickets: AdminTicketLogEntry[] }>('/admin/tickets/log');
  return response.tickets;
}

export async function redeemTicketCode(code: string) {
  const response = await apiPost<{ ticket: AdminTicketLogEntry }, { code: string }>(
    `/admin/tickets/redeem-code`,
    { code }
  );
  return response.ticket;
}

export async function deleteAdminTicketPurchase(purchaseId: string) {
  const response = await apiDelete<{ success: boolean; message: string }>(
    `/admin/tickets/${purchaseId}`
  );
  return response;
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

export async function deleteAdminMembership(membershipId: string) {
  return apiDelete<{ success: boolean }>(`/admin/memberships/${membershipId}`);
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

export type TicketValidationResult = {
  valid: boolean;
  status: string;
  message: string;
  ticket: {
    purchaseId: number;
    code: string;
    status: string;
    redeemedAt: string | null;
    ticketType: string;
    quantity: number;
    eventId: number | null;
    customerId: number | null;
    createdAt: string;
  } | null;
};

export type TicketRedemptionResult = {
  success: boolean;
  purchaseId: number;
  code: string;
  redeemedAt: string;
  redeemedBy?: string;
  ticketType: string;
  quantity: number;
};

export async function validateTicketCode(code: string) {
  return apiPost<TicketValidationResult, { code: string }>(`/admin/tickets/validate`, { code });
}

export async function redeemTicketByCode(code: string, redeemedBy?: string) {
  return apiPost<TicketRedemptionResult, { code: string; redeemedBy?: string }>(`/admin/tickets/redeem-code`, {
    code,
    redeemedBy,
  });
}

export function createAdminEventSource(token: string) {
  const baseUrl =
    API_BASE_URL || (typeof window !== 'undefined' ? window.location.origin : '');
  const url = new URL(`${baseUrl.replace(/\/$/, '')}/admin/stream`);
  if (token) {
    url.searchParams.set('token', token);
  }
  return new EventSource(url.toString());
}

// ============= Job Applications =============
export type AdminJobApplication = {
  application_id: number;
  listing_id: number;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  date_of_birth: string | null;
  resume_storage_path: string | null;
  resume_original_name: string | null;
  cover_letter: string | null;
  schedule_preference: string | null;
  available_start_date: string | null;
  has_experience_with_children: boolean;
  gender: string | null;
  pronouns: string | null;
  how_heard: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  video_url: string | null;
  video_storage_path: string | null;
  video_original_name: string | null;
  resume_mime_type: string | null;
  resume_size_bytes: number | null;
  video_mime_type: string | null;
  video_size_bytes: number | null;
  status: string;
  admin_notes: string | null;
  created_at: string;
  updated_at: string;
  job_listings?: { listing_id: number; title: string } | null;
};

export type AdminJobApplicationFilters = {
  status?: string;
  listingId?: number;
  search?: string;
  dateFrom?: string;
  dateTo?: string;
  limit?: number;
  offset?: number;
};

export type AdminJobListing = {
  listing_id: number;
  title: string;
};

export async function fetchAdminJobApplications(filters?: AdminJobApplicationFilters) {
  const params = new URLSearchParams();
  if (filters?.status) params.set('status', filters.status);
  if (filters?.listingId) params.set('listingId', String(filters.listingId));
  if (filters?.search) params.set('search', filters.search);
  if (filters?.dateFrom) params.set('dateFrom', filters.dateFrom);
  if (filters?.dateTo) params.set('dateTo', filters.dateTo);
  if (filters?.limit != null) params.set('limit', String(filters.limit));
  if (filters?.offset != null) params.set('offset', String(filters.offset));

  const query = params.toString();
  return apiGet<{ applications: AdminJobApplication[]; total: number }>(
    `/admin/job-applications${query ? `?${query}` : ''}`
  );
}

export async function fetchAdminJobApplication(applicationId: number) {
  return apiGet<{ application: AdminJobApplication; resumeUrl: string | null; videoUrl: string | null }>(
    `/admin/job-applications/${applicationId}`
  );
}

export async function updateAdminJobApplicationStatus(
  applicationId: number,
  payload: { status: string; admin_notes?: string }
) {
  return apiPatch<{ application: AdminJobApplication }, { status: string; admin_notes?: string }>(
    `/admin/job-applications/${applicationId}/status`,
    payload
  );
}

export async function deleteAdminJobApplication(applicationId: number) {
  return apiDelete<{ message: string }>(`/admin/job-applications/${applicationId}`);
}

export async function fetchAdminJobListings() {
  const response = await apiGet<{ listings: AdminJobListing[] }>('/admin/job-listings/all');
  return response.listings;
}

// ============= Events Management =============
export type AdminEvent = {
  event_id: number;
  title: string;
  description: string | null;
  start_date: string;
  end_date: string;
  image_url: string | null;
  is_published: boolean | null;
  created_at: string | null;
  updated_at: string | null;
};

export type AdminEventPhoto = {
  id: number;
  url: string;
  storagePath: string;
  caption: string | null;
  displayOrder: number | null;
  mediaType: 'image' | 'video';
};

export type AdminEventCreatePayload = {
  title: string;
  description?: string;
  start_date: string;
  end_date?: string;
  is_published?: boolean;
  image_url?: string;
};

export type AdminEventUpdatePayload = Omit<Partial<AdminEventCreatePayload>, 'image_url'> & { image_url?: string | null };

export async function fetchAdminEvents() {
  const response = await apiGet<{ events: AdminEvent[] }>('/admin/events');
  return response.events;
}

export async function createAdminEvent(payload: AdminEventCreatePayload) {
  const response = await apiPost<{ event: AdminEvent }, AdminEventCreatePayload>(
    '/admin/events',
    payload,
  );
  return response.event;
}

export async function updateAdminEvent(eventId: number, payload: AdminEventUpdatePayload) {
  const response = await apiPatch<{ event: AdminEvent }, AdminEventUpdatePayload>(
    `/admin/events/${eventId}`,
    payload,
  );
  return response.event;
}

export async function deleteAdminEvent(eventId: number) {
  return apiDelete<{ success: boolean }>(`/admin/events/${eventId}`);
}

export async function uploadEventPoster(eventId: number, file: File): Promise<string> {
  const formData = new FormData();
  formData.append('poster', file);

  const token = getAuthToken();
  const response = await fetch(`${API_BASE_URL}/admin/events/${eventId}/poster`, {
    method: 'POST',
    body: formData,
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || 'Failed to upload poster');
  }

  const data = await response.json();
  return data.imageUrl;
}

export async function uploadEventPhotos(eventId: number, files: File[]): Promise<AdminEventPhoto[]> {
  const formData = new FormData();
  files.forEach(f => formData.append('photos', f));

  const token = getAuthToken();
  const response = await fetch(`${API_BASE_URL}/admin/events/${eventId}/photos`, {
    method: 'POST',
    body: formData,
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || 'Failed to upload photos');
  }

  const data = await response.json();
  return data.photos;
}

export async function fetchEventPhotos(eventId: number): Promise<AdminEventPhoto[]> {
  const response = await apiGet<{ photos: AdminEventPhoto[] }>(`/admin/events/${eventId}/photos`);
  return response.photos;
}

export async function deleteEventPhoto(photoId: number) {
  return apiDelete<{ success: boolean }>(`/admin/events/photos/${photoId}`);
}
