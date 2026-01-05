/**
 * Admin Service - Supabase Implementation
 * Provides comprehensive CRUD operations for all admin-manageable entities
 */

import {
  UserRepository,
  CustomerRepository,
  ChildRepository,
  MembershipRepository,
  PartyBookingRepository,
  PartyPackageRepository,
  WaiverUserRepository,
  FAQRepository,
  TestimonialRepository,
  AnnouncementRepository,
  TicketTypeRepository,
  OrderRepository,
  LocationRepository,
  EventRepository,
  MembershipPlanRepository,
  TicketPurchaseRepository,
  AppPaymentRepository,
  WaiverSubmissionRepository,
  ResourceRepository,
  type User,
  type Customer,
  type Child,
  type Membership,
  type PartyBooking,
  type PartyPackage,
  type WaiverUser,
  type FAQ,
  type Testimonial,
  type Announcement,
  type Event,
  type MembershipPlan,
  type TicketPurchase,
  type AppPayment,
} from '../repositories';
import { supabase, supabaseAny } from '../config/supabase';

// ============= Helper Functions =============
/**
 * Sanitize search input for Supabase ilike queries
 * Escapes special characters that could break the filter syntax
 */
function sanitizeSearchInput(search: string): string {
  // Escape special characters used in PostgreSQL LIKE patterns
  // and Supabase filter syntax
  return search
    .replace(/\\/g, '\\\\') // Escape backslashes first
    .replace(/%/g, '\\%')   // Escape percent signs
    .replace(/_/g, '\\_')   // Escape underscores
    .replace(/'/g, "''")    // Escape single quotes
    .replace(/"/g, '\\"')   // Escape double quotes
    .replace(/\(/g, '\\(')  // Escape parentheses
    .replace(/\)/g, '\\)')
    .replace(/,/g, '\\,')   // Escape commas
    .trim();
}

// ============= Dashboard Summary =============
export async function getAdminDashboardSummary() {
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000 - 1);

  const [
    upcomingBookings,
    pendingDeposits,
    totalWaivers,
    recentWaivers,
    activeMembers,
    totalUsers,
    totalCustomers,
    activeEvents,
    recentPayments,
  ] = await Promise.all([
    // Upcoming bookings
    supabase
      .from('party_bookings')
      .select('*, party_packages(*), customers(*)')
      .gte('scheduled_start', now.toISOString())
      .order('scheduled_start', { ascending: true })
      .limit(10),
    // Pending deposits count
    supabase
      .from('party_bookings')
      .select('*', { count: 'exact', head: true })
      .eq('payment_status', 'pending'),
    // Total waiver submissions
    supabase
      .from('waiver_submissions')
      .select('*', { count: 'exact', head: true }),
    // Recent waivers
    supabase
      .from('waiver_submissions')
      .select('*')
      .order('signed_at', { ascending: false })
      .limit(5),
    // Active memberships
    supabase
      .from('memberships')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'active'),
    // Total users
    supabase
      .from('users')
      .select('*', { count: 'exact', head: true }),
    // Total customers
    supabase
      .from('customers')
      .select('*', { count: 'exact', head: true }),
    // Published events
    supabase
      .from('events')
      .select('*', { count: 'exact', head: true })
      .eq('is_published', true)
      .gte('end_date', now.toISOString()),
    // Recent payments
    supabase
      .from('app_payments')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(10),
  ]);

  // Transform upcoming bookings for frontend
  const transformedBookings = (upcomingBookings.data ?? []).map((b: Record<string, unknown>) => {
    const customer = b.customers as Record<string, unknown> | null;
    const pkg = b.party_packages as Record<string, unknown> | null;
    return {
      id: String(b.booking_id),
      reference: (b as Record<string, unknown>).reference?.toString() ?? '',
      // Normalize to location_name column used in party_bookings
      location: (b as Record<string, unknown>).location_name?.toString() ?? '',
      eventDate: b.scheduled_start ? new Date(b.scheduled_start as string).toISOString().split('T')[0] : '',
      startTime: b.scheduled_start ? new Date(b.scheduled_start as string).toISOString().split('T')[1]?.slice(0, 5) : '',
      status: b.status ?? 'Pending',
      guardian: customer ? {
        firstName: customer.full_name?.toString().split(' ')[0],
        lastName: customer.full_name?.toString().split(' ').slice(1).join(' '),
      } : null,
      partyPackage: pkg ? { id: String(pkg.package_id), name: pkg.name } : null,
    };
  });

  // Transform recent waivers for frontend
  const transformedWaivers = (recentWaivers.data ?? []).map((w: Record<string, unknown>) => ({
    id: String(w.submission_id),
    guardianName: w.guardian_name ?? '',
    signedAt: w.signed_at ?? w.created_at,
    marketingOptIn: Boolean(w.marketing_opt_in),
  }));

  return {
    generatedAt: now.toISOString(),
    bookings: {
      upcoming: transformedBookings,
      pendingDepositCount: pendingDeposits.count ?? 0,
    },
    waivers: {
      total: totalWaivers.count ?? 0,
      recent: transformedWaivers,
    },
    tickets: {
      salesToday: 0,
      redeemedToday: 0,
      unusedCodes: 0,
      salesWeek: 0,
    },
    memberships: {
      activeMembers: activeMembers.count ?? 0,
      visitsToday: 0,
    },
    users: {
      total: totalUsers.count ?? 0,
    },
    customers: {
      total: totalCustomers.count ?? 0,
    },
    events: {
      activeCount: activeEvents.count ?? 0,
    },
    payments: {
      recent: recentPayments.data ?? [],
    },
  };
}

// ============= Users Management =============
export async function listUsers(options?: { limit?: number | undefined; offset?: number | undefined; search?: string | undefined }) {
  let query = supabaseAny.from('users').select('*, customers(*)');
  
  if (options?.search) {
    const sanitized = sanitizeSearchInput(options.search);
    query = query.or(`email.ilike.%${sanitized}%,first_name.ilike.%${sanitized}%,last_name.ilike.%${sanitized}%`);
  }
  if (options?.limit) query = query.limit(options.limit);
  if (options?.offset) query = query.range(options.offset, (options.offset + (options.limit ?? 50)) - 1);
  
  const { data, error, count } = await query.order('created_at', { ascending: false });
  if (error) throw error;
  return { users: data ?? [], count };
}

export async function getUserById(userId: number) {
  return UserRepository.findById(userId);
}

export async function updateUser(userId: number, updates: Partial<User>) {
  return UserRepository.update(userId, updates);
}

export async function deleteUser(userId: number) {
  const { error } = await supabaseAny.from('users').delete().eq('user_id', userId);
  if (error) throw error;
}

// ============= Customers Management =============
export async function listCustomers(options?: { limit?: number | undefined; offset?: number | undefined; search?: string | undefined }) {
  let query = supabaseAny.from('customers').select('*');
  
  if (options?.search) {
    const sanitized = sanitizeSearchInput(options.search);
    query = query.or(`full_name.ilike.%${sanitized}%,email.ilike.%${sanitized}%,phone.ilike.%${sanitized}%`);
  }
  if (options?.limit) query = query.limit(options.limit);
  if (options?.offset) query = query.range(options.offset, (options.offset + (options.limit ?? 50)) - 1);
  
  const { data, error } = await query.order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function getCustomerById(customerId: number) {
  return CustomerRepository.findById(customerId);
}

export async function updateCustomer(customerId: number, updates: Partial<Customer>) {
  return CustomerRepository.update(customerId, updates);
}

export async function deleteCustomer(customerId: number) {
  const { error } = await supabaseAny.from('customers').delete().eq('customer_id', customerId);
  if (error) throw error;
}

// ============= Children Management =============
export async function listChildren(options?: { customerId?: number | undefined; limit?: number | undefined }) {
  let query = supabaseAny.from('children').select('*, customers(full_name, email)');
  if (options?.customerId) query = query.eq('customer_id', options.customerId);
  if (options?.limit) query = query.limit(options.limit);
  
  const { data, error } = await query.order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function getChildById(childId: number) {
  return ChildRepository.findById(childId);
}

export async function createChild(childData: {
  customer_id: number;
  first_name: string;
  last_name?: string;
  birth_date?: string;
  gender?: string;
  allergies?: string;
  notes?: string;
}) {
  return ChildRepository.create(childData);
}

export async function updateChild(childId: number, updates: Partial<Child>) {
  return ChildRepository.update(childId, updates);
}

export async function deleteChild(childId: number) {
  return ChildRepository.delete(childId);
}

// ============= Events Management =============
export async function listEvents(options?: { publishedOnly?: boolean | undefined; limit?: number | undefined }) {
  return EventRepository.findAll(options);
}

export async function getEventById(eventId: number) {
  return EventRepository.findById(eventId);
}

export async function createEvent(eventData: {
  title: string;
  description?: string;
  start_date: string;
  end_date?: string;
  location?: string;
  location_id?: number;
  capacity?: number;
  price?: number;
  tags?: string[];
  image_url?: string;
  is_published?: boolean;
}) {
  return EventRepository.create({
    ...eventData,
    end_date: eventData.end_date ?? eventData.start_date,
    tickets_remaining: eventData.capacity,
  });
}

export async function updateEvent(eventId: number, updates: Partial<Event>) {
  return EventRepository.update(eventId, updates);
}

export async function deleteEvent(eventId: number) {
  return EventRepository.delete(eventId);
}

// ============= Membership Plans Management =============
export async function listMembershipPlans(activeOnly = false) {
  return MembershipPlanRepository.findAll(activeOnly);
}

export async function getMembershipPlanById(planId: number) {
  return MembershipPlanRepository.findById(planId);
}

export async function createMembershipPlan(planData: {
  name: string;
  tier?: string;
  price_cents?: number;
  billing_cycle?: string;
  description?: string;
  monthly_price?: number;
  benefits?: string[];
  max_children?: number;
  visits_per_month?: number;
  discount_percent?: number;
  guest_passes_per_month?: number;
  is_active?: boolean;
}) {
  // Convert price_cents to monthly_price if provided
  const dataToCreate = {
    ...planData,
    monthly_price: planData.monthly_price ?? (planData.price_cents ? planData.price_cents / 100 : 0),
  };
  return MembershipPlanRepository.create(dataToCreate);
}

export async function updateMembershipPlan(planId: number, updates: Partial<MembershipPlan>) {
  return MembershipPlanRepository.update(planId, updates);
}

export async function deleteMembershipPlan(planId: number) {
  const { error } = await supabaseAny.from('membership_plans').delete().eq('plan_id', planId);
  if (error) throw error;
}

// ============= Customer Memberships Management =============
export async function listMemberships(options?: { status?: string | undefined; limit?: number | undefined }) {
  let query = supabaseAny.from('memberships').select('*, customers(*), membership_plans(*)');
  if (options?.status) query = query.eq('status', options.status);
  if (options?.limit) query = query.limit(options.limit);
  
  const { data, error } = await query.order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function getMembershipById(membershipId: number) {
  return MembershipRepository.findById(membershipId);
}

export async function createMembership(membershipData: {
  customer_id: number;
  plan_id?: number;
  tier: string;
  start_date: string;
  end_date?: string;
  stripe_subscription_id?: string;
}) {
  return MembershipRepository.create(membershipData);
}

export async function updateMembership(membershipId: number, updates: Partial<Membership>) {
  return MembershipRepository.update(membershipId, updates);
}

export async function deleteMembership(membershipId: number) {
  const { error } = await supabaseAny.from('memberships').delete().eq('membership_id', membershipId);
  if (error) throw error;
}

export async function validateMembershipEntry(lookup: string): Promise<{
  userId: string;
  membership: {
    tierName?: string;
    autoRenew?: boolean;
    visitsPerMonth?: number | null;
    visitsUsed: number;
    visitPeriodStart?: string;
    lastVisitAt?: string;
  } | null;
}> {
  // Try to find user by email, phone, or user ID
  let user = null;
  
  // Check if lookup is a number (user ID)
  const maybeUserId = parseInt(lookup);
  if (!isNaN(maybeUserId)) {
    user = await UserRepository.findById(maybeUserId);
  }
  
  // Try by email
  if (!user && lookup.includes('@')) {
    user = await UserRepository.findByEmail(lookup.toLowerCase());
  }
  
  // Try by phone
  if (!user) {
    user = await UserRepository.findByPhone(lookup);
  }
  
  if (!user) {
    return { userId: '', membership: null };
  }

  // Find active membership for user (requires customer_id)
  if (!user.customer_id) {
    return { userId: String(user.user_id), membership: null };
  }

  const membership = await MembershipRepository.findByCustomerId(user.customer_id);
  
  if (!membership || membership.status !== 'active') {
    return { userId: String(user.user_id), membership: null };
  }
  
  return {
    userId: String(user.user_id),
    membership: {
      tierName: membership.tier,
      autoRenew: membership.auto_renew ?? false,
      visitsPerMonth: membership.visits_per_month ?? null,
      visitsUsed: membership.visits_used ?? 0,
      visitPeriodStart: membership.visit_period_start,
      lastVisitAt: membership.last_visit_at,
    },
  };
}

// ============= Party Packages Management =============
export async function listPartyPackages(activeOnly = false) {
  return PartyPackageRepository.findAll(activeOnly);
}

export async function getPartyPackageById(packageId: number) {
  return PartyPackageRepository.findById(packageId);
}

export async function createPartyPackage(packageData: Partial<PartyPackage>) {
  return PartyPackageRepository.create(packageData);
}

export async function updatePartyPackage(packageId: number, updates: Partial<PartyPackage>) {
  return PartyPackageRepository.update(packageId, updates);
}

export async function deletePartyPackage(packageId: number) {
  const { error } = await supabaseAny.from('party_packages').delete().eq('package_id', packageId);
  if (error) throw error;
}

// ============= Party Bookings Management =============
export async function listBookings(options?: { status?: string | undefined; dateFrom?: string | undefined; dateTo?: string | undefined; limit?: number | undefined }) {
  let query = supabaseAny.from('party_bookings').select('*, party_packages(*), customers(*)');
  
  if (options?.status) query = query.eq('status', options.status);
  if (options?.dateFrom) query = query.gte('scheduled_start', options.dateFrom);
  if (options?.dateTo) query = query.lte('scheduled_start', options.dateTo);
  if (options?.limit) query = query.limit(options.limit);
  
  const { data, error } = await query.order('scheduled_start', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function getBookingById(bookingId: number) {
  return PartyBookingRepository.findById(bookingId);
}

export async function updateBooking(bookingId: number, updates: Partial<PartyBooking>) {
  return PartyBookingRepository.update(bookingId, updates);
}

export async function cancelBooking(bookingId: number) {
  return PartyBookingRepository.update(bookingId, { status: 'Cancelled' });
}

// ============= Waiver Users Management =============
export async function listWaiverUsers(options?: { limit?: number | undefined; search?: string | undefined }) {
  let query = supabaseAny.from('waiver_users').select('*, waiver_user_children(*)');

  if (options?.search) {
    const sanitized = sanitizeSearchInput(options.search);
    query = query.or(`email.ilike.%${sanitized}%,phone.ilike.%${sanitized}%,guardian_name.ilike.%${sanitized}%`);
  }
  if (options?.limit) query = query.limit(options.limit);
  
  const { data, error } = await query.order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function getWaiverUserById(waiverUserId: number) {
  return WaiverUserRepository.findById(waiverUserId);
}

export async function updateWaiverUser(waiverUserId: number, updates: Partial<WaiverUser>) {
  return WaiverUserRepository.update(waiverUserId, updates);
}

export async function deleteWaiverUser(waiverUserId: number) {
  const { error } = await supabaseAny.from('waiver_users').delete().eq('waiver_user_id', waiverUserId);
  if (error) throw error;
}

// ============= Waiver Submissions Management =============
export async function listWaiverSubmissions(options?: { limit?: number | undefined }) {
  const waivers = await WaiverSubmissionRepository.findAll(options);
  
  // Count submissions by email to show repeat visitors
  const emailCounts = new Map<string, number>();
  for (const w of waivers) {
    const email = w.guardian_email?.toLowerCase();
    if (email) {
      emailCounts.set(email, (emailCounts.get(email) ?? 0) + 1);
    }
  }
  
  // Add visit count to each waiver
  return waivers.map((w) => ({
    ...w,
    visit_count: w.guardian_email ? emailCounts.get(w.guardian_email.toLowerCase()) ?? 1 : 1,
  }));
}

export async function getWaiverSubmissionById(submissionId: number) {
  return WaiverSubmissionRepository.findById(submissionId);
}

export async function updateWaiverSubmission(
  submissionId: number,
  updates: Parameters<typeof WaiverSubmissionRepository.update>[1],
) {
  return WaiverSubmissionRepository.update(submissionId, updates);
}

export async function deleteWaiverSubmission(submissionId: number) {
  const { error } = await supabaseAny.from('waiver_submissions').delete().eq('submission_id', submissionId);
  if (error) throw error;
}

// ============= Ticket Purchases Management =============
export async function listTicketPurchases(options?: { status?: string | undefined; limit?: number | undefined }) {
  return TicketPurchaseRepository.findAll(options);
}

export async function getTicketPurchaseById(purchaseId: number) {
  return TicketPurchaseRepository.findById(purchaseId);
}

export async function updateTicketPurchase(purchaseId: number, updates: Partial<TicketPurchase>) {
  return TicketPurchaseRepository.update(purchaseId, updates);
}

export async function redeemTicketCode(purchaseId: number, code: string) {
  return TicketPurchaseRepository.redeemCode(purchaseId, code);
}

// ============= App Payments Management =============
export async function listAppPayments(options?: { purpose?: string | undefined; status?: string | undefined; limit?: number | undefined }) {
  return AppPaymentRepository.findAll(options);
}

export async function getAppPaymentById(paymentId: number) {
  return AppPaymentRepository.findById(paymentId);
}

export async function updateAppPayment(paymentId: number, updates: Partial<AppPayment>) {
  return AppPaymentRepository.update(paymentId, updates);
}

// ============= FAQs Management =============
export async function listFAQs(activeOnly = false) {
  return FAQRepository.findAll(activeOnly);
}

export async function getFAQById(faqId: number) {
  return FAQRepository.findById(faqId);
}

export async function createFAQ(faqData: { question: string; answer: string; category?: string; display_order?: number; is_active?: boolean }) {
  const { data, error } = await supabase
    .from('faqs')
    .insert(faqData)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateFAQ(faqId: number, updates: Partial<FAQ>) {
  return FAQRepository.update(faqId, updates);
}

export async function deleteFAQ(faqId: number) {
  return FAQRepository.delete(faqId);
}

// ============= Testimonials Management =============
export async function listTestimonials(featuredOnly = false) {
  return TestimonialRepository.findAll(featuredOnly);
}

export async function getTestimonialById(testimonialId: number) {
  return TestimonialRepository.findById(testimonialId);
}

export async function createTestimonial(testimonialData: {
  customer_name?: string;
  quote: string;
  rating?: number;
  relationship?: string;
  is_featured?: boolean;
}) {
  const { data, error } = await supabase
    .from('testimonials')
    .insert(testimonialData)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateTestimonial(testimonialId: number, updates: Partial<Testimonial>) {
  return TestimonialRepository.update(testimonialId, updates);
}

export async function deleteTestimonial(testimonialId: number) {
  return TestimonialRepository.delete(testimonialId);
}

// ============= Announcements Management =============
export async function listAnnouncements(activeOnly = false) {
  return AnnouncementRepository.findAll(activeOnly);
}

export async function getAnnouncementById(announcementId: number) {
  return AnnouncementRepository.findById(announcementId);
}

export async function createAnnouncement(announcementData: {
  title: string;
  body: string;
  publish_date?: string;
  expires_at?: string;
  is_active?: boolean;
}) {
  const { data, error } = await supabase
    .from('announcements')
    .insert(announcementData)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateAnnouncement(announcementId: number, updates: Partial<Announcement>) {
  return AnnouncementRepository.update(announcementId, updates);
}

export async function deleteAnnouncement(announcementId: number) {
  return AnnouncementRepository.delete(announcementId);
}

// ============= Ticket Types Management =============
export async function listTicketTypes(activeOnly = false) {
  return TicketTypeRepository.findAll(activeOnly);
}

export async function getTicketTypeById(ticketTypeId: number) {
  return TicketTypeRepository.findById(ticketTypeId);
}

export async function createTicketType(ticketTypeData: {
  name: string;
  description?: string;
  base_price_usd: number;
  requires_waiver?: boolean;
  requires_grip_socks?: boolean;
  location_id?: number;
  is_active?: boolean;
}) {
  const { data, error } = await supabase
    .from('ticket_types')
    .insert(ticketTypeData)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateTicketType(ticketTypeId: number, updates: Record<string, unknown>) {
  const { data, error } = await supabase
    .from('ticket_types')
    .update(updates)
    .eq('ticket_type_id', ticketTypeId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteTicketType(ticketTypeId: number) {
  const { error } = await supabaseAny.from('ticket_types').delete().eq('ticket_type_id', ticketTypeId);
  if (error) throw error;
}

// ============= Locations Management =============
export async function listLocations(activeOnly = false) {
  return LocationRepository.findAll(activeOnly);
}

export async function getLocationById(locationId: number) {
  return LocationRepository.findById(locationId);
}

export async function createLocation(locationData: {
  company_id: number;
  name: string;
  address_line?: string;
  city?: string;
  state?: string;
  postal_code?: string;
  country?: string;
  phone?: string;
  email?: string;
  is_active?: boolean;
}) {
  const { data, error } = await supabase
    .from('locations')
    .insert(locationData)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateLocation(locationId: number, updates: Record<string, unknown>) {
  const { data, error } = await supabase
    .from('locations')
    .update(updates)
    .eq('location_id', locationId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteLocation(locationId: number) {
  const { error } = await supabaseAny.from('locations').delete().eq('location_id', locationId);
  if (error) throw error;
}

// ============= Resources Management =============
export async function listResources(activeOnly = false) {
  return ResourceRepository.findAll(activeOnly);
}

export async function getResourceById(resourceId: number) {
  return ResourceRepository.findById(resourceId);
}

export async function createResource(resourceData: {
  location_id: number;
  name: string;
  type?: string;
  capacity?: number;
  is_active?: boolean;
}) {
  const { data, error } = await supabase
    .from('resources')
    .insert(resourceData)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateResource(resourceId: number, updates: Record<string, unknown>) {
  const { data, error } = await supabase
    .from('resources')
    .update(updates)
    .eq('resource_id', resourceId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteResource(resourceId: number) {
  const { error } = await supabaseAny.from('resources').delete().eq('resource_id', resourceId);
  if (error) throw error;
}

// ============= Export Functions =============
export async function exportWaiversToCsv(): Promise<{
  children: { name: string; birthDate: string; gender?: string }[];
  guardian_name: string;
  guardian_email: string | null;
  guardian_phone: string | null;
  guardian_date_of_birth: string | null;
  relationship_to_children: string | null;
  allergies: string | null;
  medical_notes: string | null;
  insurance_provider: string | null;
  insurance_policy_number: string | null;
  signature: string;
  signed_at: string;
  expires_at: string | null;
  archive_until: string | null;
  accepted_policies: string[];
  marketing_opt_in: boolean | null;
}[]> {
  const { data: waivers, error } = await supabase
    .from('waiver_submissions')
    .select('*')
    .order('signed_at', { ascending: false })
    .limit(1000);
  
  if (error) throw error;
  return (waivers ?? []) as any;
}

export async function exportContactsToCsv(): Promise<{ name: string; email: string; phone?: string; marketingOptIn: boolean }[]> {
  const [usersResult, waiversResult] = await Promise.all([
    supabaseAny.from('users').select('first_name, last_name, email, phone'),
    supabaseAny.from('waiver_submissions').select('guardian_name, guardian_email, guardian_phone, marketing_opt_in'),
  ]);

  const contacts = new Map<string, { name: string; email: string; phone?: string; marketingOptIn: boolean }>();

  ((usersResult.data ?? []) as Array<{ first_name: string | null; last_name: string | null; email: string; phone: string | null }>).forEach(user => {
    if (!user.email) return;
    const key = user.email.toLowerCase();
    contacts.set(key, {
      name: `${user.first_name ?? ''} ${user.last_name ?? ''}`.trim(),
      email: user.email,
      phone: user.phone ?? undefined,
      marketingOptIn: false,
    });
  });

  ((waiversResult.data ?? []) as Array<{ guardian_name: string; guardian_email: string | null; guardian_phone: string | null; marketing_opt_in: boolean | null }>).forEach(waiver => {
    if (!waiver.guardian_email) return;
    const key = waiver.guardian_email.toLowerCase();
    const existing = contacts.get(key);
    contacts.set(key, {
      name: waiver.guardian_name ?? existing?.name ?? '',
      email: waiver.guardian_email,
      phone: existing?.phone ?? waiver.guardian_phone ?? undefined,
      marketingOptIn: waiver.marketing_opt_in || existing?.marketingOptIn || false,
    });
  });

  return Array.from(contacts.values());
}
