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
  JobApplicationRepository,
  JobListingRepository,
  ProductPromotionRepository,
  PromoOfferRepository,
  type ProductPromotion,
  type PromoOffer,
  type PromoOfferPlan,
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
import { DateTime } from 'luxon';
import { randomUUID } from 'crypto';
import { supabase, supabaseAny } from '../config/supabase';
import { sendJobApplicationStatusChange, sendBookingConfirmation, isEmailConfigured } from './email.service';
import { createReceiptRecord, generateBookingReceiptPDF } from './receipt.service';
import { getTaxRate } from './pricing-config.service';
import { logger } from '../utils/logger';
import { AppError } from '../utils/app-error';

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
    totalBookings,
    todayBookings,
    totalWaivers,
    todayWaivers,
    recentWaivers,
    activeMembers,
    totalMembers,
    totalUsers,
    totalCustomers,
    totalPublishedEvents,
    todayEvents,
    recentPayments,
    totalApplicants,
    pendingApplicants,
    ticketPurchases,
    teamCount,
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
    // Total bookings (all time)
    supabase
      .from('party_bookings')
      .select('*', { count: 'exact', head: true }),
    // Today's bookings
    supabase
      .from('party_bookings')
      .select('*', { count: 'exact', head: true })
      .gte('scheduled_start', startOfDay.toISOString())
      .lte('scheduled_start', endOfDay.toISOString()),
    // Total waiver submissions
    supabase
      .from('waiver_submissions')
      .select('*', { count: 'exact', head: true }),
    // Today's waiver submissions
    supabase
      .from('waiver_submissions')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', startOfDay.toISOString())
      .lte('created_at', endOfDay.toISOString()),
    // Recent waivers
    supabase
      .from('waiver_submissions')
      .select('*')
      .order('date_signed', { ascending: false })
      .limit(5),
    // Active memberships
    supabase
      .from('memberships')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'active'),
    // Total memberships (all statuses)
    supabase
      .from('memberships')
      .select('*', { count: 'exact', head: true }),
    // Total users
    supabase
      .from('users')
      .select('*', { count: 'exact', head: true }),
    // Total customers
    supabase
      .from('customers')
      .select('*', { count: 'exact', head: true }),
    // Published events (all time)
    supabase
      .from('events')
      .select('*', { count: 'exact', head: true })
      .eq('is_published', true),
    // Today's events (published, happening today)
    supabase
      .from('events')
      .select('*', { count: 'exact', head: true })
      .eq('is_published', true)
      .lte('start_date', endOfDay.toISOString())
      .gte('end_date', startOfDay.toISOString()),
    // Recent payments
    supabase
      .from('app_payments')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(10),
    // Total job applications
    supabase
      .from('job_applications')
      .select('*', { count: 'exact', head: true }),
    // New (pending review) job applications
    supabase
      .from('job_applications')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'new'),
    // All ticket purchases (for revenue + code stats)
    supabase
      .from('ticket_purchases')
      .select('purchase_id, total, codes, created_at'),
    // Team members (admins + staff)
    supabase
      .from('users')
      .select('*', { count: 'exact', head: true })
      .overlaps('roles', ['admin', 'employee', 'staff']),
  ]);

  // Transform upcoming bookings for frontend (dates in ET)
  const transformedBookings = (upcomingBookings.data ?? []).map((b: Record<string, unknown>) => {
    const customer = b.customers as Record<string, unknown> | null;
    const pkg = b.party_packages as Record<string, unknown> | null;
    let eventDate = '';
    let startTime = '';
    if (b.scheduled_start) {
      const dt = DateTime.fromISO(b.scheduled_start as string).setZone('America/New_York');
      eventDate = dt.toFormat('yyyy-MM-dd');
      startTime = dt.toFormat('HH:mm');
    }
    return {
      id: String(b.booking_id),
      reference: (b as Record<string, unknown>).reference?.toString() ?? '',
      location: (b as Record<string, unknown>).location_name?.toString() ?? '',
      eventDate,
      startTime,
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

  // Compute ticket stats from purchases data
  const ticketPurchasesData = (ticketPurchases.data ?? []) as Array<{
    purchase_id: number;
    total: number;
    codes: Array<{ code: string; status: string; redeemedAt?: string }> | null;
    created_at: string;
  }>;
  let ticketTotalRevenue = 0;
  let ticketTodayRevenue = 0;
  let ticketTotalPurchases = 0;
  let ticketTodayPurchases = 0;
  let unusedCodesCount = 0;
  let redeemedTodayCount = 0;

  for (const tp of ticketPurchasesData) {
    ticketTotalPurchases++;
    ticketTotalRevenue += tp.total ?? 0;

    const createdAt = new Date(tp.created_at);
    if (createdAt >= startOfDay && createdAt <= endOfDay) {
      ticketTodayPurchases++;
      ticketTodayRevenue += tp.total ?? 0;
    }

    const codes = Array.isArray(tp.codes) ? tp.codes : [];
    for (const c of codes) {
      if (c.status === 'unused') unusedCodesCount++;
      if (c.status === 'redeemed' && c.redeemedAt) {
        const redeemedDate = new Date(c.redeemedAt);
        if (redeemedDate >= startOfDay && redeemedDate <= endOfDay) {
          redeemedTodayCount++;
        }
      }
    }
  }

  return {
    generatedAt: now.toISOString(),
    bookings: {
      total: totalBookings.count ?? 0,
      today: todayBookings.count ?? 0,
      upcoming: transformedBookings,
      pendingDepositCount: pendingDeposits.count ?? 0,
    },
    waivers: {
      total: totalWaivers.count ?? 0,
      today: todayWaivers.count ?? 0,
      recent: transformedWaivers,
    },
    tickets: {
      totalRevenue: ticketTotalRevenue,
      todayRevenue: ticketTodayRevenue,
      totalPurchases: ticketTotalPurchases,
      todayPurchases: ticketTodayPurchases,
      salesToday: ticketTodayPurchases,
      redeemedToday: redeemedTodayCount,
      unusedCodes: unusedCodesCount,
      salesWeek: ticketTotalRevenue,
    },
    memberships: {
      total: totalMembers.count ?? 0,
      activeMembers: activeMembers.count ?? 0,
      visitsToday: 0, // Updated below
    },
    users: {
      total: totalUsers.count ?? 0,
    },
    team: {
      total: teamCount.count ?? 0,
    },
    customers: {
      total: totalCustomers.count ?? 0,
    },
    events: {
      total: totalPublishedEvents.count ?? 0,
      today: todayEvents.count ?? 0,
    },
    payments: {
      recent: recentPayments.data ?? [],
    },
    applicants: {
      total: totalApplicants.count ?? 0,
      pendingCount: pendingApplicants.count ?? 0,
    },
  };
}

// ============= Users Management =============
export async function listUsers(options?: { limit?: number | undefined; offset?: number | undefined; search?: string | undefined; teamOnly?: boolean | undefined }) {
  let query = supabaseAny.from('users').select('*, customers(*)');

  // Team & Access view: only admins/staff, never the full customer base.
  if (options?.teamOnly) {
    query = query.overlaps('roles', ['admin', 'employee', 'staff']);
  }

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

export async function updateUser(userId: number, updates: Partial<User> & { role?: string; roles?: string[] }) {
  // Handle role updates - convert single role to roles array if needed
  const { role, roles, ...otherUpdates } = updates;

  const finalUpdates: Partial<User> = { ...otherUpdates };

  if (roles && roles.length > 0) {
    // Use roles array directly
    finalUpdates.roles = roles;
  } else if (role) {
    // Convert single role to array
    finalUpdates.roles = [role];
  }

  return UserRepository.update(userId, finalUpdates);
}

// Create a new team member (admin or staff) with a login they can use immediately.
export async function createTeamUser(input: {
  email: string;
  password: string;
  firstName: string;
  lastName?: string | undefined;
  phone?: string | undefined;
  role: 'admin' | 'employee';
}) {
  const email = input.email.trim().toLowerCase();

  const existing = await UserRepository.findByEmail(email);
  if (existing) {
    throw new AppError('A user with this email already exists.', 409);
  }

  // Create the Supabase Auth login (email pre-confirmed so they can sign in now).
  const { data: authData, error: authError } = await supabase.auth.admin.createUser({
    email,
    password: input.password,
    email_confirm: true,
    user_metadata: { first_name: input.firstName, last_name: input.lastName ?? '' },
  });
  if (authError || !authData?.user) {
    throw new AppError(`Failed to create login: ${authError?.message ?? 'unknown error'}`, 400);
  }

  const roles = input.role === 'admin' ? ['admin'] : ['employee'];

  const { data, error } = await supabaseAny
    .from('users')
    .insert({
      email,
      first_name: input.firstName,
      last_name: input.lastName ?? null,
      phone: input.phone ?? null,
      roles,
      auth_user_id: authData.user.id,
    })
    .select()
    .single();

  if (error) {
    // Roll back the auth login if the profile row could not be created.
    await supabase.auth.admin.deleteUser(authData.user.id).catch(() => {});
    throw error;
  }
  return data;
}

// Reset a team member's password (admin-initiated).
export async function resetUserPassword(userId: number, newPassword: string) {
  const user = await UserRepository.findById(userId);
  if (!user) throw new AppError('User not found', 404);
  if (!user.auth_user_id) throw new AppError('This account has no login to reset.', 400);
  const { error } = await supabase.auth.admin.updateUserById(user.auth_user_id, { password: newPassword });
  if (error) throw new AppError(`Failed to reset password: ${error.message}`, 400);
}

export async function deleteUser(userId: number) {
  const user = await UserRepository.findById(userId);
  const { error } = await supabaseAny.from('users').delete().eq('user_id', userId);
  if (error) throw error;
  // Also revoke the auth login so the account can no longer sign in.
  if (user?.auth_user_id) {
    await supabase.auth.admin.deleteUser(user.auth_user_id).catch(() => {});
  }
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
  image_url?: string;
  is_published?: boolean;
}) {
  return EventRepository.create({
    ...eventData,
    end_date: eventData.end_date ?? eventData.start_date,
  });
}

export async function updateEvent(eventId: number, updates: Partial<Event>) {
  return EventRepository.update(eventId, updates);
}

export async function deleteEvent(eventId: number) {
  // Clean up Supabase Storage files before deleting (DB rows cascade automatically)
  const { deleteAllEventPhotos } = await import('./event-image.service');
  await deleteAllEventPhotos(eventId);
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
  const memberships = data ?? [];

  // Batch-fetch children for all membership customers
  const customerIds = [...new Set(
    memberships.map((m: Record<string, unknown>) => m.customer_id as number).filter(Boolean),
  )];
  const childrenMap = new Map<number, Array<Record<string, unknown>>>();
  if (customerIds.length > 0) {
    const { data: children } = await supabaseAny
      .from('children')
      .select('child_id, customer_id, first_name, last_name, photo_url')
      .in('customer_id', customerIds);
    if (children) {
      for (const child of children as Array<Record<string, unknown>>) {
        const custId = child.customer_id as number;
        const list = childrenMap.get(custId) ?? [];
        list.push(child);
        childrenMap.set(custId, list);
      }
    }
  }

  // Attach children to each membership record
  return memberships.map((m: Record<string, unknown>) => ({
    ...m,
    _children: childrenMap.get(m.customer_id as number) ?? [],
  }));
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

// ============= Enhanced Membership Stats =============
export async function getMembershipStats() {
  const now = new Date();
  const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const today = now.toISOString().split('T')[0];

  const [
    planDistribution,
    upcomingExpirations,
    membershipRevenue,
    todayVisits,
    unmatchedReferrals,
  ] = await Promise.all([
    // Plan distribution (count by tier)
    supabaseAny
      .from('memberships')
      .select('tier')
      .eq('status', 'active'),
    // Upcoming expirations (next 7 days)
    supabaseAny
      .from('memberships')
      .select('*, customers(*)')
      .eq('status', 'active')
      .gte('end_date', today)
      .lte('end_date', sevenDaysFromNow)
      .order('end_date', { ascending: true }),
    // Revenue from membership receipts (actual completed purchases)
    supabaseAny
      .from('receipts')
      .select('total_usd')
      .eq('purchase_type', 'membership'),
    // Today's visit count
    supabaseAny
      .from('membership_visits')
      .select('*', { count: 'exact', head: true })
      .gte('checked_in_at', `${today}T00:00:00`),
    // Unmatched referrals count
    supabaseAny
      .from('memberships')
      .select('*', { count: 'exact', head: true })
      .eq('referral_status', 'unmatched'),
  ]);

  // Calculate plan distribution
  const distribution: Record<string, number> = {};
  for (const m of (planDistribution.data ?? [])) {
    distribution[m.tier] = (distribution[m.tier] ?? 0) + 1;
  }

  // Calculate total revenue from receipts
  let totalRevenue = 0;
  for (const p of (membershipRevenue.data ?? [])) {
    totalRevenue += p.total_usd ?? 0;
  }

  // Format upcoming expirations
  const expirations = (upcomingExpirations.data ?? []).map((m: Record<string, unknown>) => {
    const customer = m.customers as Record<string, unknown> | null;
    return {
      membershipId: String(m.membership_id),
      displayId: m.display_id ?? null,
      customerName: customer?.full_name ?? 'Unknown',
      customerEmail: customer?.email ?? null,
      tier: m.tier,
      endDate: m.end_date,
      autoRenew: m.auto_renew ?? false,
    };
  });

  return {
    planDistribution: distribution,
    totalRevenue,
    upcomingExpirations: expirations,
    visitsToday: todayVisits.count ?? 0,
    unmatchedReferralsCount: unmatchedReferrals.count ?? 0,
  };
}

// ============= Referral Management =============
export async function listUnmatchedReferrals() {
  const { data, error } = await supabaseAny
    .from('memberships')
    .select('*, customers(*)')
    .eq('referral_status', 'unmatched')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((m: Record<string, unknown>) => {
    const customer = m.customers as Record<string, unknown> | null;
    return {
      membershipId: String(m.membership_id),
      displayId: m.display_id ?? null,
      customerName: customer?.full_name ?? 'Unknown',
      referralName: m.referral_name,
      referralNormalized: m.referral_normalized,
      createdAt: m.created_at,
    };
  });
}

export async function matchReferral(membershipId: number, staffUserId: number) {
  const { data, error } = await supabaseAny
    .from('memberships')
    .update({
      referral_status: 'matched',
      matched_staff_user_id: staffUserId,
    })
    .eq('membership_id', membershipId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function listStaffMembers() {
  const { data, error } = await supabaseAny
    .from('users')
    .select('user_id, first_name, last_name, email, roles')
    .or('roles.cs.{"staff"},roles.cs.{"employee"},roles.cs.{"admin"}');
  if (error) throw error;
  return (data ?? []).map((u: Record<string, unknown>) => ({
    userId: u.user_id,
    firstName: u.first_name,
    lastName: u.last_name,
    email: u.email,
    fullName: `${u.first_name ?? ''} ${u.last_name ?? ''}`.trim(),
  }));
}

export async function getStaffReferralStats(userId: number) {
  const matched = await supabaseAny
    .from('memberships')
    .select('*', { count: 'exact', head: true })
    .eq('matched_staff_user_id', userId)
    .eq('referral_status', 'matched');

  const all = await supabaseAny
    .from('memberships')
    .select('*', { count: 'exact', head: true })
    .eq('matched_staff_user_id', userId);

  return {
    totalReferrals: all.count ?? 0,
    matchedReferrals: matched.count ?? 0,
  };
}

export async function validateMembershipEntry(lookup: string): Promise<{
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
    maxChildren?: number | null;
    maxAdults?: number | null;
  } | null;
}> {
  // Try to find membership by display_id first (PF-XXXXXX format)
  const trimmed = lookup.trim();
  if (trimmed.toUpperCase().startsWith('PF-')) {
    const membershipByDisplayId = await MembershipRepository.findByDisplayId(trimmed);
    if (membershipByDisplayId && membershipByDisplayId.status === 'active') {
      const customer = (membershipByDisplayId as unknown as { customers?: { full_name?: string; email?: string } }).customers;
      return {
        userId: '',
        membership: {
          membershipId: String(membershipByDisplayId.membership_id),
          displayId: membershipByDisplayId.display_id,
          tierName: membershipByDisplayId.tier,
          autoRenew: membershipByDisplayId.auto_renew ?? false,
          visitsPerMonth: membershipByDisplayId.visits_per_month ?? null,
          visitsUsed: membershipByDisplayId.visits_used_this_period ?? 0,
          visitPeriodStart: membershipByDisplayId.visit_period_start,
          lastVisitAt: membershipByDisplayId.last_visit_at,
          customerName: customer?.full_name ?? null,
          customerEmail: customer?.email ?? null,
          status: membershipByDisplayId.status,
          endDate: membershipByDisplayId.end_date,
          maxChildren: null,
          maxAdults: null,
        },
      };
    }
  }

  // Try to find user by email, phone, or user ID
  let user = null;

  // Check if lookup is a number (user ID or membership ID)
  const maybeUserId = parseInt(trimmed);
  if (!isNaN(maybeUserId)) {
    user = await UserRepository.findById(maybeUserId);
  }

  // Try by email
  if (!user && trimmed.includes('@')) {
    user = await UserRepository.findByEmail(trimmed.toLowerCase());
  }

  // Try by phone
  if (!user) {
    user = await UserRepository.findByPhone(trimmed);
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
      membershipId: String(membership.membership_id),
      displayId: membership.display_id ?? null,
      tierName: membership.tier,
      autoRenew: membership.auto_renew ?? false,
      visitsPerMonth: membership.visits_per_month ?? null,
      visitsUsed: membership.visits_used_this_period ?? 0,
      visitPeriodStart: membership.visit_period_start,
      lastVisitAt: membership.last_visit_at,
      customerName: user.first_name ? `${user.first_name} ${user.last_name ?? ''}`.trim() : (user.email ?? null),
      customerEmail: user.email ?? null,
      status: membership.status,
      endDate: membership.end_date,
      maxChildren: null,
      maxAdults: null,
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

  // Resolve child_ids and receipts
  const withChildren = await resolveBookingChildren(data ?? []);
  return resolveBookingReceipts(withChildren);
}

/**
 * Resolve child_ids arrays in bookings to actual child records from the children table.
 */
export async function resolveBookingChildrenPublic(bookings: Record<string, unknown>[]) {
  return resolveBookingChildren(bookings);
}
async function resolveBookingChildren(bookings: Record<string, unknown>[]) {
  // Collect all unique child IDs across bookings
  const allChildIds = new Set<number>();
  for (const b of bookings) {
    const ids = b.child_ids;
    if (Array.isArray(ids)) {
      for (const id of ids) {
        if (typeof id === 'number') allChildIds.add(id);
      }
    }
  }

  if (allChildIds.size === 0) return bookings;

  // Fetch all children in one query
  const { data: childRecords } = await supabaseAny
    .from('children')
    .select('child_id, first_name, last_name, birth_date, gender')
    .in('child_id', Array.from(allChildIds));

  const childMap = new Map<number, Record<string, unknown>>();
  for (const c of (childRecords ?? [])) {
    childMap.set(c.child_id, c);
  }

  // Attach resolved children to each booking
  for (const b of bookings) {
    const ids = b.child_ids;
    if (Array.isArray(ids) && ids.length > 0) {
      b._resolvedChildren = ids
        .map((id: number) => childMap.get(id))
        .filter(Boolean);
    } else {
      b._resolvedChildren = [];
    }
  }

  return bookings;
}

/**
 * Resolve receipts for bookings by querying the receipts table.
 */
export async function resolveBookingReceiptsPublic(bookings: Record<string, unknown>[]) {
  return resolveBookingReceipts(bookings);
}
async function resolveBookingReceipts(bookings: Record<string, unknown>[]) {
  const bookingIds = bookings
    .map(b => Number(b.booking_id))
    .filter(id => id > 0);

  if (bookingIds.length === 0) return bookings;

  const { data: receipts } = await supabaseAny
    .from('receipts')
    .select('receipt_id, receipt_number, reference_id, total_usd, tax_usd, subtotal_usd, created_at')
    .eq('purchase_type', 'booking')
    .in('reference_id', bookingIds);

  const receiptMap = new Map<number, Record<string, unknown>>();
  for (const r of (receipts ?? [])) {
    receiptMap.set(r.reference_id, r);
  }

  for (const b of bookings) {
    const receipt = receiptMap.get(Number(b.booking_id));
    b._receipt = receipt ?? null;
  }

  return bookings;
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

export async function deleteBooking(bookingId: number) {
  const { error } = await supabaseAny.from('party_bookings').delete().eq('booking_id', bookingId);
  if (error) throw error;
}

export async function createManualBooking(data: {
  packageId: number;
  guestName: string;
  guestEmail?: string;
  guestPhone?: string;
  childName?: string;
  location: string;
  eventDate: string;
  startTime: string;
  endTime?: string;
  guests: number;
  total: number;
  paymentMethod: string;
  paymentStatus: string;
  notes?: string;
  privateNotes?: string;
}) {
  // Look up the package for duration calculation
  const pkg = await PartyPackageRepository.findById(data.packageId);
  if (!pkg) throw new AppError('Party package not found', 404);

  const startDt = DateTime.fromISO(`${data.eventDate}T${data.startTime}`, { zone: 'America/New_York' });
  if (!startDt.isValid) throw new AppError('Invalid event date or start time', 400);

  // Use admin-provided end time if given, otherwise compute from package duration
  const baseDuration = (pkg.base_room_hours ?? 2) * 60;
  let partyEnd: DateTime;
  if (data.endTime) {
    partyEnd = DateTime.fromISO(`${data.eventDate}T${data.endTime}`, { zone: 'America/New_York' });
    if (!partyEnd.isValid) throw new AppError('Invalid end time', 400);
  } else {
    partyEnd = startDt.plus({ minutes: baseDuration });
  }
  const scheduledEnd = partyEnd.plus({ minutes: 30 }); // cleaning buffer

  // Build notes with child info if provided
  const noteLines: string[] = ['MANUAL BOOKING (Admin-created)'];
  if (data.childName) noteLines.push(`Birthday Child: ${data.childName}`);
  noteLines.push(`Payment: ${data.paymentMethod.toUpperCase()}`);
  if (data.notes) noteLines.push('', data.notes);
  const combinedNotes = noteLines.join('\n');

  const isPaid = data.paymentStatus === 'paid';

  // Retry with new reference on unique constraint collision (same pattern as createBooking)
  let booking: any;
  for (let attempt = 0; attempt < 3; attempt++) {
    const reference = `BK-${DateTime.now().toFormat('yyyyLLddHHmm')}-${randomUUID().slice(0, 8).toUpperCase()}`;
    try {
      booking = await PartyBookingRepository.create({
        package_id: data.packageId,
        customer_id: null,
        scheduled_start: startDt.toISO()!,
        scheduled_end: scheduledEnd.toISO()!,
        reference,
        location_name: data.location,
        event_date: data.eventDate,
        start_time: data.startTime,
        end_time: partyEnd.toFormat('HH:mm'),
        guests: data.guests,
        notes: combinedNotes,
        subtotal: data.total,
        cleaning_fee: 0,
        total: data.total,
        deposit_amount: isPaid ? data.total : 0,
        balance_remaining: isPaid ? 0 : data.total,
        payment_status: data.paymentStatus,
        payment_option: 'full',
        online_payment_amount: 0,
        venue_payment_amount: data.total,
        status: 'Confirmed',
        child_ids: [],
        guest_name: data.guestName,
        guest_email: data.guestEmail || undefined,
        guest_phone: data.guestPhone || undefined,
        private_notes: data.privateNotes || undefined,
      });
      break; // Success
    } catch (err: any) {
      if (err?.code === '23505' && attempt < 2) continue; // Unique constraint violation, retry
      throw err;
    }
  }

  // --- Generate receipt and send emails ---
  const bookingId = (booking as any).booking_id;
  const reference = (booking as any).reference ?? '';
  const pkgName = (pkg as any).name ?? 'Party Package';

  let receiptNumber: string | undefined;
  let pdfBuffer: Buffer | undefined;

  try {
    // Create receipt record
    const receiptResult = await createReceiptRecord({
      purchaseType: 'booking',
      referenceId: bookingId,
      customerId: null, // guest/manual booking
      subtotal: data.total,
      tax: 0,
      total: data.total,
      paymentMethod: data.paymentMethod === 'unpaid' ? 'Unpaid' : `${data.paymentMethod.charAt(0).toUpperCase()}${data.paymentMethod.slice(1)}`,
      paymentId: `MANUAL-${reference}`,
      metadata: {
        manual: true,
        bookingReference: reference,
        packageName: pkgName,
        eventDate: data.eventDate,
        startTime: data.startTime,
        location: data.location,
        guestCount: data.guests,
        guestName: data.guestName,
        guestEmail: data.guestEmail,
        guestPhone: data.guestPhone,
        childName: data.childName,
        paymentMethod: data.paymentMethod,
        paymentStatus: data.paymentStatus,
      },
    });
    receiptNumber = receiptResult.receiptNumber;

    // Format date for display
    const eventDt = DateTime.fromISO(data.eventDate, { zone: 'America/New_York' });
    const displayDate = eventDt.toFormat('EEEE, MMMM d, yyyy');
    const displayTime = DateTime.fromISO(`2000-01-01T${data.startTime}`).toFormat('h:mm a');
    const nowDisplay = DateTime.now().setZone('America/New_York').toFormat('MMMM d, yyyy');

    // Generate PDF receipt
    pdfBuffer = await generateBookingReceiptPDF({
      receiptNumber,
      date: nowDisplay,
      customerName: data.guestName,
      customerEmail: data.guestEmail || '',
      bookingReference: reference,
      packageName: pkgName,
      eventDate: displayDate,
      startTime: displayTime,
      location: data.location,
      guestCount: data.guests,
      subtotal: data.total,
      cleaningFee: 0,
      depositAmount: isPaid ? data.total : 0,
      balanceRemaining: isPaid ? 0 : data.total,
      total: data.total,
      paymentMethod: data.paymentMethod === 'unpaid' ? 'Unpaid' : `${data.paymentMethod.charAt(0).toUpperCase()}${data.paymentMethod.slice(1)}`,
      paymentId: `MANUAL-${reference}`,
      customerPhone: data.guestPhone,
      children: data.childName ? [{ name: data.childName }] : undefined,
      notes: data.notes,
    });

    // Send confirmation email to customer (if email provided)
    if (data.guestEmail && isEmailConfigured()) {
      await sendBookingConfirmation({
        reference,
        guestName: data.guestName,
        email: data.guestEmail,
        eventDate: displayDate,
        rawEventDate: data.eventDate,
        startTime: displayTime,
        location: data.location,
        packageName: pkgName,
        guestCount: data.guests,
        depositAmount: isPaid ? data.total : 0,
        totalAmount: data.total,
        balanceRemaining: isPaid ? 0 : data.total,
        durationMinutes: baseDuration,
        receiptPdf: pdfBuffer,
        receiptNumber,
        phone: data.guestPhone,
        children: data.childName ? [{ name: data.childName }] : undefined,
        notes: data.notes,
        packageDetails: pkg ? {
          priceUsd: (pkg as any).price_usd ?? 0,
          baseChildren: (pkg as any).base_children ?? 10,
          baseRoomHours: (pkg as any).base_room_hours ?? 2,
          includesFood: (pkg as any).includes_food ?? false,
          includesDrinks: (pkg as any).includes_drinks ?? false,
          includesDecor: (pkg as any).includes_decor ?? false,
          notes: (pkg as any).notes ?? undefined,
          features: (pkg as any).features ?? [],
          additionalTerms: (pkg as any).additional_terms ?? [],
          extraChildPrice: (pkg as any).extra_child_price ?? 40,
          extraAdultPrice: (pkg as any).extra_adult_price ?? 10,
        } : undefined,
      });
      logger.info({ email: data.guestEmail, reference }, 'Manual booking confirmation email sent to customer');
    }
  } catch (receiptErr) {
    // Don't fail the booking if receipt/email fails — just log it
    logger.error({ err: receiptErr, bookingId, reference }, 'Failed to generate receipt or send email for manual booking');
  }

  // Attach receipt info to the booking response
  (booking as any)._receiptNumber = receiptNumber;
  (booking as any)._receiptPdf = pdfBuffer ? true : false;

  return booking;
}

export async function createMembershipManually(data: {
  guestName: string;
  guestEmail: string;
  guestPhone?: string;
  childName?: string;
  password: string;
  planId: number;
  tier: string;
  durationMonths: number;
  monthlyPrice: number;
  total: number;
  paymentMethod: string;
  paymentStatus: string;
  notes?: string;
}) {
  // Get plan details
  const plan = await MembershipPlanRepository.findById(data.planId);
  if (!plan) throw new AppError('Membership plan not found', 404);

  const normalizedEmail = data.guestEmail.trim().toLowerCase();
  const nameParts = data.guestName.trim().split(/\s+/);
  const firstName = nameParts[0] || '';
  const lastName = nameParts.slice(1).join(' ') || '';

  // Create Supabase Auth user so they can log in
  let authUserId: string | undefined;
  const { data: authData, error: authError } = await supabase.auth.admin.createUser({
    email: normalizedEmail,
    password: data.password,
    email_confirm: true,
    user_metadata: { first_name: firstName, last_name: lastName, phone: data.guestPhone },
  });

  if (authError) {
    if (authError.message.includes('already been registered')) {
      // User exists in Supabase Auth — update their password
      const { data: userList } = await supabase.auth.admin.listUsers();
      const existing = userList?.users?.find(u => u.email?.toLowerCase() === normalizedEmail);
      if (existing) {
        authUserId = existing.id;
        await supabase.auth.admin.updateUserById(existing.id, { password: data.password });
      }
    } else {
      throw new AppError(`Failed to create auth account: ${authError.message}`, 500);
    }
  } else {
    authUserId = authData?.user?.id;
  }

  // Check if user already exists in our users table
  const existingUser = await UserRepository.findByEmail(normalizedEmail);
  let customer: any;

  if (existingUser) {
    // Use existing user's customer record
    customer = existingUser.customers || { customer_id: existingUser.customer_id };
    // Update auth_user_id if needed
    if (authUserId && !existingUser.auth_user_id) {
      await UserRepository.update(existingUser.user_id, { auth_user_id: authUserId } as any);
    }
  } else {
    // Create user + customer via UserRepository.create (creates both)
    const { hashPassword } = await import('../utils/password');
    const passwordHash = await hashPassword(data.password);

    const newUser = await UserRepository.create({
      email: normalizedEmail,
      password_hash: passwordHash,
      first_name: firstName,
      last_name: lastName,
      phone: data.guestPhone,
      roles: ['user'],
      auth_user_id: authUserId,
    });

    // Fetch the customer record linked to this user
    const { data: custData } = await supabaseAny
      .from('customers')
      .select('*')
      .eq('customer_id', newUser.customer_id)
      .single();
    customer = custData;
  }

  // Create child if name provided
  if (data.childName) {
    await supabaseAny.from('children').insert({
      customer_id: customer.customer_id,
      first_name: data.childName,
    });
  }

  // Calculate dates
  const startDate = DateTime.now().setZone('America/New_York').toISODate()!;
  const endDate = DateTime.now().setZone('America/New_York').plus({ months: data.durationMonths }).toISODate()!;

  // Create membership (display_id auto-generated by DB trigger)
  const membership = await MembershipRepository.create({
    customer_id: customer.customer_id,
    tier: data.tier,
    start_date: startDate,
    end_date: endDate,
    visits_per_month: plan.visits_per_month ?? undefined,
    status: 'active',
    auto_renew: false,
  });

  const membershipId = (membership as any).membership_id;
  const displayId = (membership as any).display_id ?? '';
  const isPaid = data.paymentStatus === 'paid';

  // Generate receipt and send email
  let receiptNumber: string | undefined;
  let pdfBuffer: Buffer | undefined;

  try {
    const receiptResult = await createReceiptRecord({
      purchaseType: 'membership',
      referenceId: membershipId,
      customerId: customer.customer_id,
      subtotal: data.total,
      tax: 0,
      total: data.total,
      paymentMethod: data.paymentMethod === 'unpaid' ? 'Unpaid' : `${data.paymentMethod.charAt(0).toUpperCase()}${data.paymentMethod.slice(1)}`,
      paymentId: `MANUAL-MBR-${displayId}`,
      metadata: {
        manual: true,
        planName: plan.name,
        tier: data.tier,
        durationMonths: data.durationMonths,
        monthlyPrice: data.monthlyPrice,
        startDate,
        expiryDate: endDate,
        paymentMethod: data.paymentMethod,
        paymentStatus: data.paymentStatus,
      },
    });
    receiptNumber = receiptResult.receiptNumber;

    const { generateMembershipReceiptPDF } = await import('./receipt.service');
    const nowDisplay = DateTime.now().setZone('America/New_York').toFormat('MMMM d, yyyy');
    const startDisplay = DateTime.fromISO(startDate).toFormat('MMMM d, yyyy');
    const endDisplay = DateTime.fromISO(endDate).toFormat('MMMM d, yyyy');

    pdfBuffer = await generateMembershipReceiptPDF({
      receiptNumber,
      date: nowDisplay,
      customerName: data.guestName,
      customerEmail: data.guestEmail || '',
      planName: plan.name,
      monthlyPrice: data.monthlyPrice,
      durationMonths: data.durationMonths,
      subtotal: data.total,
      taxAmount: 0,
      total: data.total,
      paymentMethod: data.paymentMethod === 'unpaid' ? 'Unpaid' : `${data.paymentMethod.charAt(0).toUpperCase()}${data.paymentMethod.slice(1)}`,
      paymentId: `MANUAL-MBR-${displayId}`,
      startDate: startDisplay,
      expiryDate: endDisplay,
      benefits: plan.benefits ?? [],
    });

    // Send email to customer
    if (data.guestEmail && isEmailConfigured()) {
      const { sendMembershipConfirmation } = await import('./email.service');
      await sendMembershipConfirmation({
        email: data.guestEmail,
        customerName: data.guestName,
        tierName: plan.name,
        displayId,
        startDate: startDisplay,
        expiryDate: endDisplay,
        visitsPerMonth: plan.visits_per_month,
        guestPassesPerMonth: plan.guest_passes_per_month,
        discountPercent: plan.discount_percent ? Number(plan.discount_percent) : null,
        benefits: plan.benefits,
        autoRenew: false,
        monthlyPrice: data.monthlyPrice,
        durationMonths: data.durationMonths,
        total: data.total,
        receiptPdf: pdfBuffer,
        receiptNumber,
        maxChildren: plan.max_children,
        maxAdults: plan.max_adults,
        childName: data.childName,
        loginPassword: data.password,
      });
      logger.info({ email: data.guestEmail, displayId }, 'Manual membership confirmation email sent');
    }
  } catch (receiptErr) {
    logger.error({ err: receiptErr, membershipId }, 'Failed to generate receipt/email for manual membership');
  }

  return {
    membershipId,
    displayId,
    receiptNumber,
    customerId: customer.customer_id,
    tier: data.tier,
    planName: plan.name,
    startDate,
    endDate,
  };
}

export async function issueTicketsManually(data: {
  guestName: string;
  guestEmail?: string;
  guestPhone?: string;
  ticketTypeId?: number;
  quantity: number;
  unitPrice: number;
  total: number;
  paymentMethod: string;
}) {
  // Create or find a guest customer
  const { data: customer, error: custErr } = await supabaseAny
    .from('customers')
    .insert({
      full_name: data.guestName,
      email: data.guestEmail || null,
      phone: data.guestPhone || null,
      is_guest: true,
    })
    .select()
    .single();
  if (custErr) throw custErr;

  // Generate ticket codes
  const codes = [];
  for (let i = 0; i < data.quantity; i++) {
    codes.push({
      code: `PF-${randomUUID().substring(0, 12).toUpperCase()}`,
      status: 'unused',
    });
  }

  const purchase = await TicketPurchaseRepository.create({
    customer_id: customer.customer_id,
    ticket_type_id: data.ticketTypeId,
    ticket_type: 'general',
    quantity: data.quantity,
    unit_price: data.unitPrice,
    total: data.total,
    codes,
    status: 'confirmed',
    metadata: {
      manual: true,
      paymentMethod: data.paymentMethod,
      issuedBy: 'admin',
    },
    provider_payment_id: `MANUAL-${Date.now()}`,
  });

  return {
    purchaseId: purchase.purchase_id,
    codes: codes.map(c => c.code),
    total: data.total,
    quantity: data.quantity,
  };
}

// ============= Waiver Users Management =============
export async function listWaiverUsers(options?: { limit?: number | undefined; search?: string | undefined }) {
  let query = supabaseAny.from('waiver_users').select('*, waiver_user_children(*)');

  if (options?.search) {
    const sanitized = sanitizeSearchInput(options.search);
    query = query.or(`guardian_email.ilike.%${sanitized}%,guardian_phone.ilike.%${sanitized}%,guardian_first_name.ilike.%${sanitized}%,guardian_last_name.ilike.%${sanitized}%`);
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

export async function deleteTicketPurchase(purchaseId: number) {
  return TicketPurchaseRepository.delete(purchaseId);
}

export async function redeemTicketCode(purchaseId: number, code: string) {
  return TicketPurchaseRepository.redeemCode(purchaseId, code);
}

/**
 * Look up a ticket by its code (e.g., PF-ABC12345)
 * Returns the purchase and code status
 */
export async function lookupTicketByCode(code: string) {
  const normalizedCode = code.trim().toUpperCase();
  const purchase = await TicketPurchaseRepository.findByCode(normalizedCode);

  if (!purchase) {
    return null;
  }

  // Find the specific code in the codes array
  const codes = purchase.codes as Array<{ code: string; status: string; redeemedAt?: string }>;
  const codeEntry = codes.find(c => c.code === normalizedCode);

  return {
    purchase,
    codeEntry,
  };
}

/**
 * Validate a ticket code without redeeming it
 */
export async function validateTicketCode(code: string) {
  let result;
  try {
    result = await lookupTicketByCode(code);
  } catch {
    return {
      valid: false,
      status: 'invalid',
      message: 'Invalid ticket number',
      ticket: null,
    };
  }

  if (!result || !result.codeEntry) {
    return {
      valid: false,
      status: 'invalid',
      message: 'Invalid ticket number',
      ticket: null,
    };
  }

  const { purchase, codeEntry } = result;
  const isValid = codeEntry.status === 'unused';

  return {
    valid: isValid,
    status: codeEntry.status,
    message: isValid
      ? 'Ticket is valid and ready to be redeemed'
      : codeEntry.status === 'redeemed'
        ? `Ticket was already redeemed on ${codeEntry.redeemedAt}`
        : `Ticket status: ${codeEntry.status}`,
    ticket: {
      purchaseId: purchase.purchase_id,
      code: codeEntry.code,
      status: codeEntry.status,
      redeemedAt: codeEntry.redeemedAt || null,
      ticketType: purchase.ticket_type,
      quantity: purchase.quantity,
      eventId: purchase.event_id,
      customerId: purchase.customer_id,
      createdAt: purchase.created_at,
    },
  };
}

/**
 * Redeem a ticket code (looks up by code, doesn't need purchaseId)
 */
export async function redeemTicketByCode(code: string, redeemedBy?: string) {
  const normalizedCode = code.trim().toUpperCase();
  const result = await lookupTicketByCode(normalizedCode);

  if (!result || !result.codeEntry) {
    throw new Error('Ticket code not found');
  }

  const { purchase, codeEntry } = result;

  if (codeEntry.status === 'redeemed') {
    throw new Error(`Ticket was already redeemed on ${codeEntry.redeemedAt}`);
  }

  // Redeem the code
  const updatedPurchase = await TicketPurchaseRepository.redeemCode(purchase.purchase_id, normalizedCode);

  // Return in the format expected by frontend (AdminTicketLogEntry)
  return {
    id: String(updatedPurchase.purchase_id),
    guardian: updatedPurchase.customers ? {
      firstName: updatedPurchase.customers.first_name,
      lastName: updatedPurchase.customers.last_name,
      email: updatedPurchase.customers.email,
    } : null,
    type: updatedPurchase.ticket_type,
    quantity: updatedPurchase.quantity,
    total: updatedPurchase.total,
    createdAt: updatedPurchase.created_at,
    codes: updatedPurchase.codes as Array<{ code: string; status: string; redeemedAt?: string }>,
  };
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
export async function exportWaiversToCsv(dateFrom?: string, dateTo?: string): Promise<{
  children: { name: string; first_name?: string; last_name?: string; birthDate: string; birth_date?: string; gender?: string }[];
  guardian_first_name: string;
  guardian_last_name: string;
  guardian_email: string | null;
  guardian_phone: string | null;
  guardian_date_of_birth: string | null;
  relationship_to_minor: string | null;
  digital_signature: string;
  signature_image_url: string | null;
  date_signed: string;
  expires_at: string | null;
  archive_until: string | null;
  accepted_policies: string[];
  marketing_sms_opt_in: boolean | null;
  marketing_email_opt_in: boolean | null;
}[]> {
  // Join waiver_users → waiver_user_children for waiver-only users
  let query = supabaseAny
    .from('waiver_submissions')
    .select('*, waiver_users(*, waiver_user_children(*))')
    .order('date_signed', { ascending: false });

  if (dateFrom) {
    query = query.gte('date_signed', `${dateFrom}T00:00:00`);
  }
  if (dateTo) {
    query = query.lte('date_signed', `${dateTo}T23:59:59`);
  }

  const { data: waivers, error } = await query.limit(5000);

  if (error) throw error;

  const results = (waivers ?? []) as any[];

  // Map waiver_user_children into a normalized children array for waiver-only users
  for (const w of results) {
    const waiverUserChildren = w.waiver_users?.waiver_user_children ?? [];
    if (waiverUserChildren.length > 0) {
      w.children = waiverUserChildren.map((c: Record<string, unknown>) => ({
        name: `${c.minor_first_name || ''} ${c.minor_last_name || ''}`.trim(),
        first_name: c.minor_first_name || '',
        last_name: c.minor_last_name || '',
        birthDate: c.minor_date_of_birth || '',
        birth_date: c.minor_date_of_birth || '',
        gender: c.minor_gender || '',
      }));
    }
  }

  // Resolve children from the `children` table for main account users (child_ids array)
  const allChildIds: number[] = [];
  for (const w of results) {
    if (Array.isArray(w.child_ids) && w.child_ids.length > 0 && !w.children?.length) {
      allChildIds.push(...w.child_ids);
    }
  }

  if (allChildIds.length > 0) {
    const uniqueChildIds = [...new Set(allChildIds)];
    const childRecords = await ChildRepository.findByIds(uniqueChildIds);
    const childMap = new Map(childRecords.map(c => [c.child_id, c]));

    for (const w of results) {
      if (Array.isArray(w.child_ids) && w.child_ids.length > 0 && !w.children?.length) {
        w.children = w.child_ids
          .map((id: number) => childMap.get(id))
          .filter(Boolean)
          .map((c: { first_name: string; last_name?: string | null; birth_date?: string | null; gender?: string | null }) => ({
            name: `${c.first_name || ''} ${c.last_name || ''}`.trim(),
            first_name: c.first_name || '',
            last_name: c.last_name || '',
            birthDate: c.birth_date || '',
            birth_date: c.birth_date || '',
            gender: c.gender || '',
          }));
      }
    }
  }

  // Default empty children array for waivers with no children resolved
  for (const w of results) {
    if (!w.children) w.children = [];
  }

  return results;
}

// ============= Job Applications Management =============
export async function listJobApplications(options?: {
  status?: string;
  listingId?: number;
  search?: string;
  dateFrom?: string;
  dateTo?: string;
  limit?: number;
  offset?: number;
}) {
  return JobApplicationRepository.findAll(options);
}

export async function getJobApplicationById(applicationId: number) {
  return JobApplicationRepository.findById(applicationId);
}

export async function updateJobApplicationStatus(applicationId: number, status: string, adminNotes?: string) {
  // Fetch current application to get previous status + applicant info for email
  const current = await JobApplicationRepository.findById(applicationId);
  if (!current) {
    throw new Error('Application not found');
  }

  const result = await JobApplicationRepository.updateStatus(applicationId, status, adminNotes);

  // Send status change notification if status actually changed
  if (current.status !== status) {
    // Get job title from listing
    const listing = current.listing_id
      ? await JobListingRepository.findById(current.listing_id)
      : null;

    sendJobApplicationStatusChange({
      applicantFirstName: current.first_name,
      applicantEmail: current.email,
      jobTitle: (listing?.title as string) ?? 'Unknown Position',
      previousStatus: current.status as string,
      newStatus: status,
    }).catch(err => {
      logger.error({ error: err }, 'Failed to send application status change email');
    });
  }

  return result;
}

export async function deleteJobApplication(applicationId: number) {
  const app = await JobApplicationRepository.findById(applicationId);
  if (!app) {
    throw new Error('Application not found');
  }

  // Clean up stored files
  if (app.resume_storage_path) {
    await supabase.storage.from('resumes').remove([app.resume_storage_path]).catch(() => {});
  }
  if (app.video_storage_path) {
    await supabase.storage.from('application-videos').remove([app.video_storage_path]).catch(() => {});
  }

  await JobApplicationRepository.deleteById(applicationId);
}

export async function getJobListingsForFilter() {
  return JobListingRepository.findAll();
}

// ============= Job Listings Management =============
export async function listJobListingsForAdmin(options?: {
  isActive?: boolean;
  search?: string;
  limit?: number;
  offset?: number;
}) {
  return JobListingRepository.findAllForAdmin(options);
}

export async function getJobListingById(listingId: number) {
  return JobListingRepository.findById(listingId);
}

export async function createJobListing(input: Record<string, unknown>) {
  // Ensure slug uniqueness (PG unique constraint also guards this, but give a nicer error)
  if (typeof input.slug === 'string') {
    const existing = await JobListingRepository.findBySlug(input.slug);
    if (existing) {
      throw new AppError('A job listing with this slug already exists', 409);
    }
  }
  return JobListingRepository.create(input);
}

export async function updateJobListing(listingId: number, input: Record<string, unknown>) {
  const current = await JobListingRepository.findById(listingId);
  if (!current) throw new AppError('Job listing not found', 404);

  if (typeof input.slug === 'string' && input.slug !== current.slug) {
    const existing = await JobListingRepository.findBySlug(input.slug);
    if (existing) throw new AppError('A job listing with this slug already exists', 409);
  }
  return JobListingRepository.update(listingId, input);
}

export async function deleteJobListing(listingId: number) {
  const current = await JobListingRepository.findById(listingId);
  if (!current) throw new AppError('Job listing not found', 404);

  const appCount = await JobListingRepository.countApplications(listingId);
  if (appCount > 0) {
    throw new AppError(
      `Cannot delete listing with ${appCount} existing application(s). Deactivate it instead, or delete the applications first.`,
      409,
    );
  }
  await JobListingRepository.deleteById(listingId);
}

// ============= Job Applications Full Update =============
export async function updateJobApplication(applicationId: number, input: Record<string, unknown>) {
  const current = await JobApplicationRepository.findById(applicationId);
  if (!current) throw new AppError('Application not found', 404);

  const updated = await JobApplicationRepository.update(applicationId, input);

  // If status changed as part of the update, fire the notification email (best effort)
  if (typeof input.status === 'string' && input.status !== current.status) {
    const listing = current.listing_id
      ? await JobListingRepository.findById(current.listing_id)
      : null;
    sendJobApplicationStatusChange({
      applicantFirstName: (input.first_name as string) ?? current.first_name,
      applicantEmail: (input.email as string) ?? current.email,
      jobTitle: (listing?.title as string) ?? 'Unknown Position',
      previousStatus: current.status as string,
      newStatus: input.status,
    }).catch(err => {
      logger.error({ error: err }, 'Failed to send application status change email');
    });
  }

  return updated;
}

export async function getApplicationResumeSignedUrl(storagePath: string) {
  const { data, error } = await supabase.storage
    .from('resumes')
    .createSignedUrl(storagePath, 600); // 10 minutes
  if (error) throw error;
  return data.signedUrl;
}

export async function getApplicationVideoSignedUrl(storagePath: string) {
  const { data, error } = await supabase.storage
    .from('application-videos')
    .createSignedUrl(storagePath, 600);
  if (error) throw error;
  return data.signedUrl;
}

export async function exportContactsToCsv(dateFrom?: string, dateTo?: string): Promise<{ name: string; email: string; phone?: string; marketingOptIn: boolean }[]> {
  let waiverQuery = supabaseAny
    .from('waiver_submissions')
    .select('guardian_first_name, guardian_last_name, guardian_email, guardian_phone, marketing_sms_opt_in, marketing_email_opt_in, date_signed');

  if (dateFrom) {
    waiverQuery = waiverQuery.gte('date_signed', `${dateFrom}T00:00:00`);
  }
  if (dateTo) {
    waiverQuery = waiverQuery.lte('date_signed', `${dateTo}T23:59:59`);
  }

  const [usersResult, waiversResult] = await Promise.all([
    supabaseAny.from('users').select('first_name, last_name, email, phone'),
    waiverQuery,
  ]);

  const contacts = new Map<string, { name: string; email: string; phone?: string; marketingOptIn: boolean }>();

  // Only add users if no date filter is applied (contacts export with date filter focuses on waivers)
  if (!dateFrom && !dateTo) {
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
  }

  ((waiversResult.data ?? []) as Array<{ guardian_first_name: string; guardian_last_name: string; guardian_email: string | null; guardian_phone: string | null; marketing_sms_opt_in: boolean | null; marketing_email_opt_in: boolean | null }>).forEach(waiver => {
    if (!waiver.guardian_email) return;
    const key = waiver.guardian_email.toLowerCase();
    const existing = contacts.get(key);
    const guardianName = `${waiver.guardian_first_name ?? ''} ${waiver.guardian_last_name ?? ''}`.trim();
    contacts.set(key, {
      name: guardianName || existing?.name || '',
      email: waiver.guardian_email,
      phone: existing?.phone ?? waiver.guardian_phone ?? undefined,
      marketingOptIn: waiver.marketing_sms_opt_in || waiver.marketing_email_opt_in || existing?.marketingOptIn || false,
    });
  });

  return Array.from(contacts.values());
}

// ============= Product Promotions Management =============
export async function listProductPromotions() {
  return ProductPromotionRepository.findAll();
}

export async function getProductPromotionById(promotionId: number) {
  return ProductPromotionRepository.findById(promotionId);
}

export async function createProductPromotion(data: {
  product_type: string;
  product_id?: number | null;
  discount_type: 'percent' | 'fixed_price';
  discount_value: number;
  promo_label?: string;
  promo_note?: string;
  starts_at: string;
  ends_at: string;
  max_redemptions?: number | null;
}) {
  return ProductPromotionRepository.create(data);
}

export async function updateProductPromotion(promotionId: number, updates: Partial<ProductPromotion>) {
  return ProductPromotionRepository.update(promotionId, updates);
}

export async function deleteProductPromotion(promotionId: number) {
  // Soft delete — just deactivate
  return ProductPromotionRepository.update(promotionId, { is_active: false });
}

// ============= Promo Offers Management =============
export async function listPromoOffers() {
  return PromoOfferRepository.findAll();
}

export async function getPromoOfferById(offerId: number) {
  return PromoOfferRepository.findById(offerId);
}

export async function createPromoOffer(data: {
  title: string;
  subtitle?: string;
  promo_label?: string;
  promo_note?: string;
  notes?: string[];
  plans: PromoOfferPlan[];
  starts_at: string;
  ends_at: string;
  max_redemptions?: number | null;
}) {
  return PromoOfferRepository.create(data);
}

export async function updatePromoOffer(offerId: number, updates: Partial<PromoOffer>) {
  return PromoOfferRepository.update(offerId, updates);
}

export async function deletePromoOffer(offerId: number) {
  // Soft delete — just deactivate
  return PromoOfferRepository.update(offerId, { is_active: false });
}
