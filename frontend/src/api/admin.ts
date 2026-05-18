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
  subtotal: number;
  cleaningFee: number;
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
  // Extras / add-ons
  addOns?: Array<{ id?: string; code?: string; label?: string; name?: string; price?: number; quantity?: number }>;
  // Children associated with the booking
  children?: Array<{ name: string; birthDate: string | null }>;
  // Booking creation timestamp
  createdAt?: string | null;
  // Receipt info
  receipt?: {
    receiptNumber: string;
    totalUsd: number;
    taxUsd: number;
    subtotalUsd: number;
  } | null;
};

export type AdminBookingUpdatePayload = Partial<{
  status: 'Pending' | 'Confirmed' | 'Cancelled';
  eventDate: string;
  startTime: string;
  location: string;
  notes: string;
  privateNotes: string;
  guestName: string;
  guestEmail: string;
  guestPhone: string;
  guests: number;
  total: number;
  paymentStatus: string;
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
  displayId?: string | null;
  children?: Array<{
    id: number;
    firstName: string;
    lastName?: string | null;
    photoUrl?: string | null;
  }>;
  membership: {
    membershipId: string | null;
    tierName: string;
    status: 'active' | 'cancelled' | 'expired';
    autoRenew: boolean;
    startDate?: string | null;
    endDate?: string | null;
    visitsPerMonth: number | null;
    visitsUsed: number;
    visitsRemaining: number | null;
    remainingDays?: number | null;
    maxChildren?: number;
    maxAdults?: number;
    visitPeriodStart?: string;
    lastVisitAt?: string;
    discountPercent?: number;
    guestPassesPerMonth?: number;
    referralName?: string | null;
    referralStatus?: string | null;
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

export type AdminCreateBookingPayload = {
  guestName: string;
  guestEmail?: string;
  guestPhone?: string;
  childName?: string;
  partyPackageId: string;
  location: string;
  eventDate: string;
  startTime: string;
  endTime?: string;
  guests: number;
  total: number;
  paymentMethod: 'cash' | 'card' | 'square' | 'other' | 'unpaid';
  paymentStatus: 'paid' | 'awaiting_deposit' | 'awaiting_full_payment' | 'deposit_paid';
  notes?: string;
  privateNotes?: string;
};

export async function createAdminBooking(payload: AdminCreateBookingPayload) {
  const response = await apiPost<{ booking: AdminBooking }, AdminCreateBookingPayload>(
    '/admin/bookings',
    payload,
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
  return apiDelete<{ success: boolean }>(`/admin/waivers/${waiverId}`);
}

export type AdminCreateMembershipPayload = {
  guestName: string;
  guestEmail?: string;
  guestPhone?: string;
  childName?: string;
  password?: string;
  planId: number;
  tier: string;
  durationMonths: number;
  monthlyPrice: number;
  total: number;
  paymentMethod: string;
  paymentStatus: string;
  notes?: string;
};

export async function createAdminMembership(payload: AdminCreateMembershipPayload) {
  return apiPost<{ membershipId: number; displayId: string; receiptNumber?: string }, AdminCreateMembershipPayload>(
    '/admin/memberships',
    payload,
  );
}

export type AdminIssueTicketPayload = {
  guestName: string;
  guestEmail?: string;
  guestPhone?: string;
  ticketTypeId?: number;
  quantity: number;
  unitPrice: number;
  total: number;
  paymentMethod: string;
};

export async function issueAdminTickets(payload: AdminIssueTicketPayload) {
  return apiPost<{ purchaseId: number; codes: string[]; total: number; quantity: number }, AdminIssueTicketPayload>(
    '/admin/tickets/issue',
    payload,
  );
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

export async function recordAdminMembershipVisit(
  membershipId: string,
  checkInData?: { childrenCount?: number; adultsCount?: number; notes?: string },
) {
  const response = await apiPost<
    {
      membershipId: number;
      membership: NonNullable<AdminMembership['membership']> & {
        extraChildren?: number;
        extraAdults?: number;
        extraCharge?: number;
      };
    },
    { childrenCount?: number; adultsCount?: number; notes?: string }
  >(`/admin/memberships/${membershipId}/visit`, checkInData ?? {});
  return response.membership;
}

export type MembershipValidationResult = {
  userId: string;
  membership: {
    membershipId?: string;
    displayId?: string | null;
    tierName?: string;
    autoRenew?: boolean;
    visitsPerMonth?: number | null;
    visitsUsed: number;
    visitPeriodStart?: string;
    lastVisitAt?: string;
    customerName?: string | null;
    customerEmail?: string | null;
    status?: string;
    endDate?: string | null;
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

// Full job listing (admin detail/CRUD)
export type AdminJobListingFull = {
  listing_id: number;
  title: string;
  slug: string;
  department: string;
  employment_type: 'full-time' | 'part-time' | 'seasonal' | 'internship';
  location: string;
  description: string;
  responsibilities: string[];
  qualifications: string[];
  nice_to_have: string[];
  perks: string[];
  pay_range: string | null;
  minimum_age: number | null;
  schedule_notes: string | null;
  display_order: number;
  is_active: boolean;
  published_at: string | null;
  closes_at: string | null;
  created_at: string;
  updated_at: string;
};

export type AdminJobListingCreateInput = {
  title: string;
  slug: string;
  department: string;
  employment_type: 'full-time' | 'part-time' | 'seasonal' | 'internship';
  location?: string;
  description: string;
  responsibilities?: string[];
  qualifications?: string[];
  nice_to_have?: string[];
  perks?: string[];
  pay_range?: string | null;
  minimum_age?: number;
  schedule_notes?: string | null;
  display_order?: number;
  is_active?: boolean;
  closes_at?: string | null;
};

export type AdminJobListingUpdateInput = Partial<AdminJobListingCreateInput>;

export type AdminJobApplicationUpdateInput = {
  first_name?: string;
  last_name?: string;
  email?: string;
  phone?: string;
  date_of_birth?: string | null;
  cover_letter?: string | null;
  schedule_preference?: string | null;
  available_start_date?: string | null;
  has_experience_with_children?: boolean;
  gender?: string | null;
  pronouns?: string | null;
  how_heard?: string | null;
  emergency_contact_name?: string | null;
  emergency_contact_phone?: string | null;
  status?: string;
  admin_notes?: string | null;
  listing_id?: number;
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

// Full admin update of an application (name, email, phone, etc.)
export async function updateAdminJobApplication(
  applicationId: number,
  payload: AdminJobApplicationUpdateInput,
) {
  return apiPatch<{ application: AdminJobApplication }, AdminJobApplicationUpdateInput>(
    `/admin/job-applications/${applicationId}`,
    payload,
  );
}

// ============= Job Listings CRUD =============
export type AdminJobListingsFilters = {
  search?: string;
  isActive?: boolean;
  limit?: number;
  offset?: number;
};

export async function fetchAdminJobListingsFull(filters?: AdminJobListingsFilters) {
  const params = new URLSearchParams();
  if (filters?.search) params.set('search', filters.search);
  if (filters?.isActive !== undefined) params.set('isActive', String(filters.isActive));
  if (filters?.limit != null) params.set('limit', String(filters.limit));
  if (filters?.offset != null) params.set('offset', String(filters.offset));
  const query = params.toString();
  return apiGet<{ listings: AdminJobListingFull[]; total: number }>(
    `/admin/job-listings${query ? `?${query}` : ''}`,
  );
}

export async function fetchAdminJobListing(listingId: number) {
  return apiGet<{ listing: AdminJobListingFull }>(`/admin/job-listings/${listingId}`);
}

export async function createAdminJobListing(payload: AdminJobListingCreateInput) {
  return apiPost<{ listing: AdminJobListingFull }, AdminJobListingCreateInput>(
    '/admin/job-listings',
    payload,
  );
}

export async function updateAdminJobListing(
  listingId: number,
  payload: AdminJobListingUpdateInput,
) {
  return apiPatch<{ listing: AdminJobListingFull }, AdminJobListingUpdateInput>(
    `/admin/job-listings/${listingId}`,
    payload,
  );
}

export async function deleteAdminJobListing(listingId: number) {
  return apiDelete<{ message: string }>(`/admin/job-listings/${listingId}`);
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

export async function uploadEventPhotos(
  eventId: number,
  files: File[],
  onProgress?: (percent: number) => void,
): Promise<AdminEventPhoto[]> {
  const formData = new FormData();
  files.forEach(f => formData.append('photos', f));

  const token = getAuthToken();

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${API_BASE_URL}/admin/events/${eventId}/photos`);
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);

    if (onProgress) {
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          onProgress(Math.round((e.loaded / e.total) * 100));
        }
      };
    }

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const data = JSON.parse(xhr.responseText);
          resolve(data.photos);
        } catch {
          reject(new Error('Invalid response from server'));
        }
      } else {
        reject(new Error(xhr.responseText || 'Failed to upload photos'));
      }
    };

    xhr.onerror = () => reject(new Error('Upload failed — network error'));
    xhr.send(formData);
  });
}

export async function fetchEventPhotos(eventId: number): Promise<AdminEventPhoto[]> {
  const response = await apiGet<{ photos: AdminEventPhoto[] }>(`/admin/events/${eventId}/photos`);
  return response.photos;
}

export async function deleteEventPhoto(photoId: number) {
  return apiDelete<{ success: boolean }>(`/admin/events/photos/${photoId}`);
}

// ============= Product Promotions =============
export type AdminProductPromotion = {
  promotion_id: number;
  product_type: string;
  product_id: number | null;
  discount_type: 'percent' | 'fixed_price';
  discount_value: number;
  promo_label: string | null;
  promo_note: string | null;
  starts_at: string;
  ends_at: string;
  max_redemptions: number | null;
  redemptions: number;
  is_active: boolean;
  created_at: string;
};

export async function fetchAdminPromotions(): Promise<AdminProductPromotion[]> {
  const response = await apiGet<{ promotions: AdminProductPromotion[] }>('/admin/promotions');
  return response.promotions;
}

export async function createAdminPromotion(data: {
  product_type: string;
  product_id?: number | null;
  discount_type: 'percent' | 'fixed_price';
  discount_value: number;
  promo_label?: string;
  promo_note?: string;
  starts_at: string;
  ends_at: string;
  max_redemptions?: number | null;
}): Promise<AdminProductPromotion> {
  const response = await apiPost<{ promotion: AdminProductPromotion }, typeof data>('/admin/promotions', data);
  return response.promotion;
}

export async function updateAdminPromotion(
  promotionId: number,
  updates: Partial<AdminProductPromotion>,
): Promise<AdminProductPromotion> {
  const response = await apiPatch<{ promotion: AdminProductPromotion }, typeof updates>(
    `/admin/promotions/${promotionId}`,
    updates,
  );
  return response.promotion;
}

export async function deleteAdminPromotion(promotionId: number) {
  return apiDelete<{ success: boolean }>(`/admin/promotions/${promotionId}`);
}

// ============= Promo Offers =============
export type AdminPromoOfferPlan = {
  name: string;
  normalValue: number;
  regularPrice: number;
  promoPrice: number;
  savingsPercent: number;
};

export type AdminPromoOffer = {
  offer_id: number;
  title: string;
  subtitle: string | null;
  promo_label: string | null;
  promo_note: string | null;
  notes: string[];
  plans: AdminPromoOfferPlan[];
  starts_at: string;
  ends_at: string;
  max_redemptions: number | null;
  redemptions: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export async function fetchAdminPromoOffers(): Promise<AdminPromoOffer[]> {
  const response = await apiGet<{ offers: AdminPromoOffer[] }>('/admin/promo-offers');
  return response.offers;
}

export async function createAdminPromoOffer(data: {
  title: string;
  subtitle?: string;
  promo_label?: string;
  promo_note?: string;
  notes?: string[];
  plans: AdminPromoOfferPlan[];
  starts_at: string;
  ends_at: string;
  max_redemptions?: number | null;
}): Promise<AdminPromoOffer> {
  const response = await apiPost<{ offer: AdminPromoOffer }, typeof data>('/admin/promo-offers', data);
  return response.offer;
}

export async function updateAdminPromoOffer(
  offerId: number,
  updates: Partial<AdminPromoOffer>,
): Promise<AdminPromoOffer> {
  const response = await apiPatch<{ offer: AdminPromoOffer }, typeof updates>(
    `/admin/promo-offers/${offerId}`,
    updates,
  );
  return response.offer;
}

export async function deleteAdminPromoOffer(offerId: number) {
  return apiDelete<{ success: boolean }>(`/admin/promo-offers/${offerId}`);
}

// ============= Enhanced Membership Stats =============
export type MembershipStats = {
  planDistribution: Record<string, number>;
  totalRevenue: number;
  upcomingExpirations: Array<{
    membershipId: string;
    displayId: string | null;
    customerName: string;
    customerEmail: string | null;
    tier: string;
    endDate: string;
    autoRenew: boolean;
  }>;
  visitsToday: number;
  unmatchedReferralsCount: number;
};

export type UnmatchedReferral = {
  membershipId: string;
  displayId: string | null;
  customerName: string;
  referralName: string;
  referralNormalized: string;
  createdAt: string;
};

export type StaffMember = {
  userId: number;
  firstName: string;
  lastName: string;
  email: string;
  fullName: string;
};

export async function fetchMembershipStats() {
  return apiGet<MembershipStats>('/admin/memberships/stats');
}

export async function fetchUnmatchedReferrals() {
  const response = await apiGet<{ referrals: UnmatchedReferral[] }>('/admin/memberships/referrals/unmatched');
  return response.referrals;
}

export async function matchReferral(membershipId: string, staffUserId: number) {
  return apiPost<{ membership: unknown }, { staffUserId: number }>(
    `/admin/memberships/referrals/${membershipId}/match`,
    { staffUserId },
  );
}

export async function fetchStaffMembers() {
  const response = await apiGet<{ staff: StaffMember[] }>('/admin/staff');
  return response.staff;
}
