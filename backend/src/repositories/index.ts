/**
 * Supabase repositories for database operations
 * These replace the Mongoose models with Supabase client calls
 */

import { supabase, supabaseAny } from '../config/supabase';
import { logDbOperation } from '../utils/logger';
import type {
  User,
  Customer,
  Child,
  Membership,
  MembershipVisit,
  PartyPackage,
  PartyBooking,
  WaiverUser,
  WaiverUserChild,
  FAQ,
  Testimonial,
  Announcement,
  TicketType,
  Payment,
  Order,
  OrderItem,
  Resource,
  Promotion,
  Event,
  MembershipPlan,
  TicketPurchase,
  AppPayment,
  WaiverSubmission,
  PartyAddOn,
  PricingConfig,
} from '../types/database.types';

// Re-export types for convenience
export type {
  User,
  Customer,
  Child,
  Membership,
  MembershipVisit,
  PartyPackage,
  PartyBooking,
  WaiverUser,
  WaiverUserChild,
  FAQ,
  Testimonial,
  Announcement,
  TicketType,
  Payment,
  Order,
  OrderItem,
  Resource,
  Promotion,
  Event,
  MembershipPlan,
  TicketPurchase,
  AppPayment,
  WaiverSubmission,
  PartyAddOn,
  PricingConfig,
};

// ============= User Repository =============
export const UserRepository = {
  async findByEmail(email: string) {
    const { data, error } = await supabase
      .from('users')
      .select('*, customers(*)')
      .eq('email', email.toLowerCase())
      .single();
    if (error && error.code !== 'PGRST116') throw error;
    return data;
  },

  async findById(userId: number) {
    const { data, error } = await supabase
      .from('users')
      .select('*, customers(*)')
      .eq('user_id', userId)
      .single();
    if (error && error.code !== 'PGRST116') throw error;
    return data;
  },

  async findByPhone(phone: string) {
    const { data, error } = await supabase
      .from('users')
      .select('*, customers(*)')
      .eq('phone', phone)
      .single();
    if (error && error.code !== 'PGRST116') throw error;
    return data;
  },

  async findByAuthUserId(authUserId: string) {
    const { data, error } = await supabase
      .from('users')
      .select('*, customers(*)')
      .eq('auth_user_id', authUserId)
      .single();
    if (error && error.code !== 'PGRST116') throw error;
    return data;
  },

  async createFromSupabaseAuth(authUser: {
    id: string;
    email: string;
    user_metadata?: {
      // Standard fields
      first_name?: string;
      last_name?: string;
      phone?: string;
      // Google OAuth fields
      full_name?: string;
      name?: string;
      given_name?: string;
      family_name?: string;
    };
  }) {
    const metadata = authUser.user_metadata ?? {};

    // Extract first name: prioritize given_name (Google), then first_name (standard)
    let firstName = metadata.given_name || metadata.first_name || '';

    // Extract last name: prioritize family_name (Google), then last_name (standard)
    let lastName = metadata.family_name || metadata.last_name || '';

    // If no separate names, try to parse from full_name or name (Google)
    if (!firstName && !lastName) {
      const fullName = metadata.full_name || metadata.name || '';
      if (fullName) {
        const parts = fullName.trim().split(/\s+/);
        firstName = parts[0] || '';
        lastName = parts.slice(1).join(' ') || '';
      }
    }

    const phone = metadata.phone;
    const fullNameForCustomer = `${firstName} ${lastName}`.trim() || 'New User';

    // First create a customer record
    const { data: customer, error: customerError } = await supabase
      .from('customers')
      .insert({
        full_name: fullNameForCustomer,
        email: authUser.email.toLowerCase(),
        phone,
      })
      .select()
      .single();

    if (customerError) throw customerError;

    // Then create the user linked to the customer and Supabase auth
    const { data, error } = await supabase
      .from('users')
      .insert({
        email: authUser.email.toLowerCase(),
        first_name: firstName || null,
        last_name: lastName || null,
        phone: phone || null,
        auth_user_id: authUser.id,
        roles: ['user'],
        customer_id: customer.customer_id,
      })
      .select('*, customers(*)')
      .single();

    if (error) throw error;
    return data;
  },

  async create(userData: {
    email: string;
    password_hash: string;
    first_name?: string;
    last_name?: string;
    phone?: string;
    roles?: string[];
    auth_user_id?: string;
  }) {
    // First create a customer record
    const { data: customer, error: customerError } = await supabase
      .from('customers')
      .insert({
        full_name: `${userData.first_name ?? ''} ${userData.last_name ?? ''}`.trim() || 'New User',
        email: userData.email.toLowerCase(),
        phone: userData.phone,
      })
      .select()
      .single();
    
    if (customerError) throw customerError;

    // Then create the user linked to the customer
    const { data, error } = await supabase
      .from('users')
      .insert({
        email: userData.email.toLowerCase(),
        password_hash: userData.password_hash,
        first_name: userData.first_name,
        last_name: userData.last_name,
        phone: userData.phone,
        roles: userData.roles ?? ['user'],
        customer_id: customer.customer_id,
        auth_user_id: userData.auth_user_id,
      })
      .select()
      .single();
    
    if (error) throw error;
    return data;
  },

  async update(userId: number, updates: Partial<User>) {
    const { data, error } = await supabase
      .from('users')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('user_id', userId)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async findAll(options?: { limit?: number; offset?: number }) {
    let query = supabaseAny.from('users').select('*, customers(*)');
    if (options?.limit) query = query.limit(options.limit);
    if (options?.offset) query = query.range(options.offset, (options.offset + (options.limit ?? 10)) - 1);
    const { data, error } = await query;
    if (error) throw error;
    return data ?? [];
  },

  async count() {
    const { count, error } = await supabase
      .from('users')
      .select('*', { count: 'exact', head: true });
    if (error) throw error;
    return count ?? 0;
  },
};

// ============= Customer Repository =============
export const CustomerRepository = {
  async findById(customerId: number) {
    const { data, error } = await supabase
      .from('customers')
      .select('*')
      .eq('customer_id', customerId)
      .single();
    if (error && error.code !== 'PGRST116') throw error;
    return data;
  },

  async findByEmail(email: string) {
    const { data, error } = await supabase
      .from('customers')
      .select('*')
      .eq('email', email.toLowerCase())
      .single();
    if (error && error.code !== 'PGRST116') throw error;
    return data;
  },

  async create(customerData: Partial<Customer>) {
    const { data, error } = await supabase
      .from('customers')
      .insert(customerData)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async update(customerId: number, updates: Partial<Customer>) {
    const { data, error } = await supabase
      .from('customers')
      .update(updates)
      .eq('customer_id', customerId)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async findAll() {
    const { data, error } = await supabaseAny.from('customers').select('*');
    if (error) throw error;
    return data ?? [];
  },

  /**
   * Find an existing guest customer by email or create a new one.
   * This ensures guest data is properly stored in the customers table.
   */
  async findOrCreateGuest(guestData: {
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
  }) {
    const normalizedEmail = guestData.email.toLowerCase().trim();

    // First, try to find existing customer by email
    const { data: existing, error: findError } = await supabase
      .from('customers')
      .select('*')
      .eq('email', normalizedEmail)
      .single();

    if (findError && findError.code !== 'PGRST116') throw findError;

    // If customer exists, update their info and return
    if (existing) {
      const { data: updated, error: updateError } = await supabase
        .from('customers')
        .update({
          full_name: `${guestData.firstName} ${guestData.lastName}`.trim(),
          phone: guestData.phone,
          updated_at: new Date().toISOString(),
        })
        .eq('customer_id', existing.customer_id)
        .select()
        .single();

      if (updateError) throw updateError;
      return updated;
    }

    // Create new guest customer
    const { data: newCustomer, error: createError } = await supabase
      .from('customers')
      .insert({
        full_name: `${guestData.firstName} ${guestData.lastName}`.trim(),
        email: normalizedEmail,
        phone: guestData.phone,
        is_guest: true,
      })
      .select()
      .single();

    if (createError) throw createError;
    return newCustomer;
  },
};

// ============= Child Repository =============
export const ChildRepository = {
  async findByCustomerId(customerId: number) {
    const { data, error } = await supabase
      .from('children')
      .select('*')
      .eq('customer_id', customerId);
    if (error) throw error;
    return data ?? [];
  },

  async findById(childId: number) {
    const { data, error } = await supabase
      .from('children')
      .select('*')
      .eq('child_id', childId)
      .single();
    if (error && error.code !== 'PGRST116') throw error;
    return data;
  },

  async findByIds(childIds: number[]) {
    if (childIds.length === 0) return [];
    const { data, error } = await supabase
      .from('children')
      .select('*')
      .in('child_id', childIds);
    if (error) throw error;
    return data ?? [];
  },

  async create(childData: {
    customer_id: number;
    first_name: string;
    last_name?: string;
    birth_date?: string;
    gender?: string;
  }) {
    const { data, error } = await supabase
      .from('children')
      .insert(childData)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async update(childId: number, updates: Partial<Child>) {
    const { data, error } = await supabase
      .from('children')
      .update(updates)
      .eq('child_id', childId)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async delete(childId: number) {
    const { error } = await supabase
      .from('children')
      .delete()
      .eq('child_id', childId);
    if (error) throw error;
  },
};

// ============= Membership Repository =============
export const MembershipRepository = {
  async findByCustomerId(customerId: number) {
    const { data, error } = await supabase
      .from('memberships')
      .select('*')
      .eq('customer_id', customerId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();
    if (error && error.code !== 'PGRST116') throw error;
    return data;
  },

  /**
   * Find all memberships for a customer by tier, ordered by end_date descending.
   * Used to check for existing active/queued memberships of the same tier.
   */
  async findByCustomerIdAndTier(customerId: number, tier: string) {
    const { data, error } = await supabase
      .from('memberships')
      .select('*')
      .eq('customer_id', customerId)
      .eq('tier', tier)
      .in('status', ['active', 'pending'])
      .order('end_date', { ascending: false });
    if (error) throw error;
    return data ?? [];
  },

  /**
   * Find the latest membership for a customer by tier (active or pending).
   * Returns the one with the furthest end_date.
   */
  async findLatestByCustomerIdAndTier(customerId: number, tier: string) {
    const { data, error } = await supabase
      .from('memberships')
      .select('*')
      .eq('customer_id', customerId)
      .eq('tier', tier)
      .in('status', ['active', 'pending'])
      .order('end_date', { ascending: false })
      .limit(1)
      .single();
    if (error && error.code !== 'PGRST116') throw error;
    return data;
  },

  async findById(membershipId: number) {
    const { data, error } = await supabase
      .from('memberships')
      .select('*')
      .eq('membership_id', membershipId)
      .single();
    if (error && error.code !== 'PGRST116') throw error;
    return data;
  },

  async create(membershipData: {
    customer_id: number;
    tier: string;
    start_date: string;
    end_date?: string;
    visits_per_month?: number;
    status?: string;
    auto_renew?: boolean;
    refund_policy_accepted?: boolean;
    refund_policy_accepted_at?: string;
    referral_name?: string;
    referral_normalized?: string;
    referral_status?: string;
    matched_staff_user_id?: number;
  }) {
    const { data, error } = await supabase
      .from('memberships')
      .insert(membershipData)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async update(membershipId: number, updates: Partial<Membership>) {
    const { data, error } = await supabase
      .from('memberships')
      .update(updates)
      .eq('membership_id', membershipId)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async findActive() {
    const { data, error } = await supabase
      .from('memberships')
      .select('*, customers(*)')
      .eq('status', 'active');
    if (error) throw error;
    return data ?? [];
  },

  /**
   * Atomically record a visit - increments visits_used_this_period only if within limit
   * Returns the updated membership or null if visit limit was reached
   */
  async recordVisitAtomic(membershipId: number, visitsPerMonth: number | null): Promise<Membership | null> {
    // If unlimited visits, just update last_visit_at
    if (visitsPerMonth === null) {
      const { data, error } = await supabase
        .from('memberships')
        .update({ last_visit_at: new Date().toISOString() })
        .eq('membership_id', membershipId)
        .select()
        .single();
      if (error) throw error;
      return data;
    }

    // Use RPC for atomic increment with condition check
    // This prevents race conditions by doing the check and update in a single operation
    const { data, error } = await supabase.rpc('record_membership_visit', {
      p_membership_id: membershipId,
      p_visits_per_month: visitsPerMonth,
    });

    if (error) {
      // If RPC doesn't exist, fall back to optimistic update
      // 42883 = Postgres "function does not exist", PGRST202 = PostgREST schema cache miss
      const msg = error.message ?? '';
      if (error.code === '42883' || error.code === 'PGRST202' || msg.includes('Could not find the function')) {
        const membership = await this.findById(membershipId);
        if (!membership) return null;

        const visitsUsed = membership.visits_used_this_period ?? 0;
        if (visitsUsed >= visitsPerMonth) return null;

        const { data: updated, error: updateError } = await supabase
          .from('memberships')
          .update({
            visits_used_this_period: visitsUsed + 1,
            last_visit_at: new Date().toISOString(),
          })
          .eq('membership_id', membershipId)
          .eq('visits_used_this_period', visitsUsed) // Optimistic lock
          .select()
          .single();

        if (updateError || !updated) {
          // Optimistic lock failed (concurrent conflict) - throw to allow caller to retry
          throw new Error('CONCURRENT_VISIT_CONFLICT');
        }
        return updated;
      }
      throw error;
    }

    return data;
  },

  async findByDisplayId(displayId: string) {
    const { data, error } = await supabase
      .from('memberships')
      .select('*, customers(*)')
      .eq('display_id', displayId.toUpperCase())
      .single();
    if (error && error.code !== 'PGRST116') throw error;
    return data;
  },

  async findExpiringBetween(startDate: string, endDate: string) {
    const { data, error } = await supabase
      .from('memberships')
      .select('*, customers(*)')
      .eq('status', 'active')
      .gte('end_date', startDate)
      .lte('end_date', endDate);
    if (error) throw error;
    return data ?? [];
  },

  async findExpiredWithGracePeriod(today: string) {
    const { data, error } = await supabase
      .from('memberships')
      .select('*, customers(*)')
      .eq('status', 'active')
      .lt('end_date', today)
      .gte('grace_period_end', today);
    if (error) throw error;
    return data ?? [];
  },

  async findPastGracePeriod(today: string) {
    const { data, error } = await supabase
      .from('memberships')
      .select('*, customers(*)')
      .eq('status', 'active')
      .not('grace_period_end', 'is', null)
      .lt('grace_period_end', today);
    if (error) throw error;
    return data ?? [];
  },

  async findWithReferralStatus(status: string) {
    const { data, error } = await supabase
      .from('memberships')
      .select('*, customers(*)')
      .eq('referral_status', status)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data ?? [];
  },

  async countByTier() {
    const { data, error } = await supabase
      .from('memberships')
      .select('tier, status')
      .eq('status', 'active');
    if (error) throw error;
    const counts: Record<string, number> = {};
    for (const m of (data ?? [])) {
      counts[m.tier] = (counts[m.tier] ?? 0) + 1;
    }
    return counts;
  },
};

// ============= Membership Visit Repository =============
export const MembershipVisitRepository = {
  async create(visitData: {
    membership_id: number;
    children_count?: number;
    adults_count?: number;
    extra_children?: number;
    extra_adults?: number;
    extra_charge?: number;
    checked_in_by?: number;
    notes?: string;
  }) {
    const { data, error } = await supabase
      .from('membership_visits')
      .insert(visitData)
      .select()
      .single();
    if (error) throw error;
    return data as MembershipVisit;
  },

  async findByMembershipId(membershipId: number, limit = 50) {
    const { data, error } = await supabase
      .from('membership_visits')
      .select('*')
      .eq('membership_id', membershipId)
      .order('checked_in_at', { ascending: false })
      .limit(limit);
    if (error) throw error;
    return (data ?? []) as MembershipVisit[];
  },

  async countByMembershipId(membershipId: number) {
    const { count, error } = await supabase
      .from('membership_visits')
      .select('*', { count: 'exact', head: true })
      .eq('membership_id', membershipId);
    if (error) throw error;
    return count ?? 0;
  },

  async countTodayVisits() {
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    const { count, error } = await supabase
      .from('membership_visits')
      .select('*', { count: 'exact', head: true })
      .gte('checked_in_at', startOfDay);
    if (error) throw error;
    return count ?? 0;
  },
};

// ============= Party Package Repository =============
export const PartyPackageRepository = {
  async findAll(activeOnly = true) {
    let query = supabaseAny.from('party_packages').select('*');
    if (activeOnly) query = query.eq('is_active', true);
    const { data, error } = await query.order('name', { ascending: true });
    if (error) throw error;
    return data ?? [];
  },

  async findById(packageId: number) {
    const { data, error } = await supabase
      .from('party_packages')
      .select('*')
      .eq('package_id', packageId)
      .single();
    if (error && error.code !== 'PGRST116') throw error;
    return data;
  },

  async create(packageData: Partial<PartyPackage>) {
    const { data, error } = await supabase
      .from('party_packages')
      .insert(packageData)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async update(packageId: number, updates: Partial<PartyPackage>) {
    const { data, error } = await supabase
      .from('party_packages')
      .update(updates)
      .eq('package_id', packageId)
      .select()
      .single();
    if (error) throw error;
    return data;
  },
};

// ============= Party Booking Repository =============
export const PartyBookingRepository = {
  async findById(bookingId: number) {
    const { data, error } = await supabase
      .from('party_bookings')
      .select('*, party_packages(*), customers(*)')
      .eq('booking_id', bookingId)
      .single();
    if (error && error.code !== 'PGRST116') throw error;
    return data;
  },

  async findByReference(reference: string) {
    const { data, error } = await supabase
      .from('party_bookings')
      .select('*, party_packages(*), customers(*)')
      .eq('reference', reference)
      .single();
    if (error && error.code !== 'PGRST116') throw error;
    return data;
  },

  async findByCustomerId(customerId: number) {
    const { data, error } = await supabase
      .from('party_bookings')
      .select('*, party_packages(*)')
      .eq('customer_id', customerId)
      .order('event_date', { ascending: true });
    if (error) throw error;
    return data ?? [];
  },

  async findByDateRange(startDate: string, endDate: string) {
    const { data, error } = await supabase
      .from('party_bookings')
      .select('*, party_packages(*), customers(*)')
      .gte('scheduled_start', startDate)
      .lte('scheduled_start', endDate)
      .order('scheduled_start', { ascending: true });
    if (error) throw error;
    return data ?? [];
  },

  async findByLocationAndDate(location: string, eventDate: string, excludeBookingId?: number) {
    let query = supabase
      .from('party_bookings')
      .select('*')
      .eq('location_name', location)
      .eq('event_date', eventDate)
      .neq('status', 'Cancelled');
    
    if (excludeBookingId) {
      query = query.neq('booking_id', excludeBookingId);
    }
    
    const { data, error } = await query;
    if (error) throw error;
    return data ?? [];
  },

  async create(bookingData: {
    package_id: number;
    customer_id: number | null;
    scheduled_start: string;
    scheduled_end: string;
    status?: string;
    // Extended fields
    reference?: string;
    event_date?: string;
    start_time?: string;
    end_time?: string;
    location_name?: string;
    guests?: number;
    notes?: string;
    add_ons?: Record<string, unknown>[];
    subtotal?: number;
    cleaning_fee?: number;
    total?: number;
    deposit_amount?: number;
    balance_remaining?: number;
    payment_status?: string;
    child_ids?: number[];
    // Partial payment fields
    payment_option?: 'full' | 'split';
    online_payment_amount?: number;
    venue_payment_amount?: number;
    // Guest contact fields
    guest_name?: string;
    guest_email?: string;
    guest_phone?: string;
    // Admin fields
    private_notes?: string;
  }) {
    const { data, error } = await supabase
      .from('party_bookings')
      .insert(bookingData)
      .select('*, party_packages(*)')
      .single();
    if (error) throw error;
    return data;
  },

  async update(bookingId: number, updates: Partial<PartyBooking>) {
    const { data, error } = await supabase
      .from('party_bookings')
      .update(updates)
      .eq('booking_id', bookingId)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  /**
   * Update booking with a condition check to prevent race conditions.
   * Returns the updated booking or null if the condition was not met.
   */
  async updateWithCondition(
    bookingId: number,
    updates: Partial<PartyBooking>,
    conditions: { status?: { neq?: string; eq?: string } }
  ) {
    let query = supabase
      .from('party_bookings')
      .update(updates)
      .eq('booking_id', bookingId);

    if (conditions.status?.neq) {
      query = query.neq('status', conditions.status.neq);
    }
    if (conditions.status?.eq) {
      query = query.eq('status', conditions.status.eq);
    }

    const { data, error } = await query.select().single();

    // PGRST116 = no rows returned (condition not met)
    if (error && error.code === 'PGRST116') {
      return null;
    }
    if (error) throw error;
    return data;
  },

  async findAll(options?: { status?: string; limit?: number; paidOnly?: boolean }) {
    let query = supabase
      .from('party_bookings')
      .select('*, party_packages(*), customers(*)');
    if (options?.status) query = query.eq('status', options.status);
    // Filter out unpaid bookings (still in cart) - only show confirmed/paid bookings
    if (options?.paidOnly) query = query.not('deposit_paid_at', 'is', null);
    if (options?.limit) query = query.limit(options.limit);
    const { data, error } = await query.order('event_date', { ascending: false });
    if (error) throw error;
    return data ?? [];
  },

  async count(status?: string) {
    let query = supabaseAny.from('party_bookings').select('*', { count: 'exact', head: true });
    if (status) query = query.eq('status', status);
    const { count, error } = await query;
    if (error) throw error;
    return count ?? 0;
  },

  /**
   * Find confirmed bookings whose event_date matches any of the given dates.
   * Used by the booking reminder scheduler to find upcoming parties.
   */
  async findUpcomingConfirmed(eventDates: string[]) {
    if (eventDates.length === 0) return [];
    const { data, error } = await supabase
      .from('party_bookings')
      .select('*, party_packages(*), customers(*)')
      .eq('status', 'Confirmed')
      .in('event_date', eventDates);
    if (error) throw error;
    return data ?? [];
  },
};

// ============= Resource Repository =============
export const ResourceRepository = {
  async findAll(activeOnly = true) {
    let query = supabaseAny.from('resources').select('*');
    if (activeOnly) query = query.eq('is_active', true);
    const { data, error } = await query;
    if (error) throw error;
    return data ?? [];
  },

  async findById(resourceId: number) {
    const { data, error } = await supabase
      .from('resources')
      .select('*')
      .eq('resource_id', resourceId)
      .single();
    if (error && error.code !== 'PGRST116') throw error;
    return data;
  },

  async findByType(type: string) {
    const { data, error } = await supabase
      .from('resources')
      .select('*')
      .eq('type', type)
      .eq('is_active', true);
    if (error) throw error;
    return data ?? [];
  },
};

// ============= Waiver Repository =============
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type WaiverSubmissionData = any;

// Helper to map DB record to backward-compatible format
function mapWaiverSubmission(data: WaiverSubmissionData): WaiverSubmissionData {
  if (!data) return data;

  // Extract children from waiver_users.waiver_user_children if available
  const waiverUser = data.waiver_users as { waiver_user_children?: Array<Record<string, unknown>> } | null;
  const waiverUserChildren = waiverUser?.waiver_user_children || [];
  const children = waiverUserChildren.map((c: Record<string, unknown>) => ({
    childId: c.waiver_user_child_id as number | undefined,
    name: `${c.minor_first_name || ''} ${c.minor_last_name || ''}`.trim(),
    first_name: c.minor_first_name as string || '',
    last_name: c.minor_last_name as string || '',
    birthDate: c.minor_date_of_birth as string || '',
    birth_date: c.minor_date_of_birth as string || '',
    gender: c.minor_gender as string || '',
  }));

  const mapped = {
    ...data,
    // Map new column names to old for backward compatibility
    guardian_name: `${data.guardian_first_name || ''} ${data.guardian_last_name || ''}`.trim(),
    signature: data.digital_signature,
    signed_at: data.date_signed,
    relationship_to_children: data.relationship_to_minor,
    marketing_opt_in: data.marketing_sms_opt_in || data.marketing_email_opt_in,
    // Keep new columns available too
    waiver_submission_id: data.submission_id,
    waiver_id: data.submission_id,
    // Children from waiver_user_children table
    children,
    // camelCase aliases for frontend
    guardianName: `${data.guardian_first_name || ''} ${data.guardian_last_name || ''}`.trim(),
    guardianEmail: data.guardian_email,
    guardianPhone: data.guardian_phone,
    guardianDateOfBirth: data.guardian_date_of_birth,
    relationshipToChildren: data.relationship_to_minor,
    signedAt: data.date_signed,
    expiresAt: data.expires_at,
    archiveUntil: data.archive_until,
    marketingOptIn: data.marketing_sms_opt_in || data.marketing_email_opt_in,
    acceptedPolicies: data.accepted_policies,
    waiverCode: data.waiver_code ?? null,
    allergies: null, // Removed from schema
    medicalNotes: null, // Removed from schema
    insuranceProvider: null, // Removed from schema
    insurancePolicyNumber: null, // Removed from schema
  };
  return mapped;
}

export const WaiverRepository = {
  async findByCustomerId(customerId: number) {
    const { data, error } = await supabase
      .from('waiver_submissions')
      .select('*')
      .eq('customer_id', customerId)
      .order('date_signed', { ascending: false });
    if (error) throw error;
    return (data ?? []).map(mapWaiverSubmission);
  },

  async findByWaiverUserId(waiverUserId: number) {
    const { data, error } = await supabase
      .from('waiver_submissions')
      .select('*')
      .eq('waiver_user_id', waiverUserId)
      .order('date_signed', { ascending: false });
    if (error) throw error;
    return (data ?? []).map(mapWaiverSubmission);
  },

  async findValidByEmail(email: string) {
    const { data, error } = await supabase
      .from('waiver_submissions')
      .select('*')
      .eq('guardian_email', email.toLowerCase())
      .gte('archive_until', new Date().toISOString())
      .order('date_signed', { ascending: false })
      .limit(1)
      .single();
    if (error && error.code !== 'PGRST116') throw error;
    return data ? mapWaiverSubmission(data) : null;
  },

  async findByEmail(email: string) {
    const { data, error } = await supabase
      .from('waiver_submissions')
      .select('*')
      .eq('guardian_email', email.toLowerCase())
      .order('date_signed', { ascending: false });
    if (error) throw error;
    return (data ?? []).map(mapWaiverSubmission);
  },

  async findByGuardianEmail(email: string) {
    const { data, error } = await supabase
      .from('waiver_submissions')
      .select('*')
      .eq('guardian_email', email.toLowerCase())
      .order('date_signed', { ascending: false });
    if (error) throw error;
    return (data ?? []).map(mapWaiverSubmission);
  },

  async findByGuardianPhone(phone: string) {
    const { data, error } = await supabase
      .from('waiver_submissions')
      .select('*')
      .eq('guardian_phone', phone)
      .order('date_signed', { ascending: false });
    if (error) throw error;
    return (data ?? []).map(mapWaiverSubmission);
  },

  async create(waiverData: {
    customer_id?: number;
    waiver_user_id?: number;
    guardian_name?: string;
    guardian_first_name?: string;
    guardian_last_name?: string;
    guardian_email?: string;
    guardian_phone?: string;
    guardian_date_of_birth?: string;
    relationship_to_children?: string;
    relationship_to_minor?: string;
    child_ids?: number[];
    signature?: string;
    digital_signature?: string;
    accepted_policies: string[];
    marketing_opt_in?: boolean;
    marketing_sms_opt_in?: boolean;
    marketing_email_opt_in?: boolean;
    archive_until?: string;
    ip_address?: string;
    waiver_code?: string;
    signature_image_url?: string;
  }) {
    // Parse guardian_name into first/last if provided
    let firstName = waiverData.guardian_first_name;
    let lastName = waiverData.guardian_last_name;

    if (!firstName && waiverData.guardian_name) {
      const parts = waiverData.guardian_name.trim().split(' ');
      firstName = parts[0] || 'Unknown';
      lastName = parts.slice(1).join(' ') || '';
    }

    const insertData: Record<string, unknown> = {
      customer_id: waiverData.customer_id,
      waiver_user_id: waiverData.waiver_user_id,
      guardian_first_name: firstName || 'Unknown',
      guardian_last_name: lastName || '',
      guardian_email: waiverData.guardian_email?.toLowerCase(),
      guardian_phone: waiverData.guardian_phone,
      guardian_date_of_birth: waiverData.guardian_date_of_birth,
      relationship_to_minor: waiverData.relationship_to_minor || waiverData.relationship_to_children,
      digital_signature: waiverData.digital_signature || waiverData.signature || '',
      waiver_agreement_accepted: true,
      accepted_policies: waiverData.accepted_policies,
      marketing_sms_opt_in: waiverData.marketing_sms_opt_in ?? waiverData.marketing_opt_in ?? false,
      marketing_email_opt_in: waiverData.marketing_email_opt_in ?? waiverData.marketing_opt_in ?? false,
      archive_until: waiverData.archive_until,
      ip_address: waiverData.ip_address,
      waiver_code: waiverData.waiver_code,
      signature_image_url: waiverData.signature_image_url,
    };

    // Only include child_ids if provided (for main users)
    if (waiverData.child_ids && waiverData.child_ids.length > 0) {
      insertData.child_ids = waiverData.child_ids;
    }

    const { data, error } = await supabase
      .from('waiver_submissions')
      .insert(insertData)
      .select()
      .single();
    if (error) throw error;
    return mapWaiverSubmission(data);
  },

  async findByWaiverCode(code: string) {
    const { data, error } = await supabase
      .from('waiver_submissions')
      .select('submission_id')
      .eq('waiver_code', code)
      .limit(1);
    if (error) throw error;
    return (data ?? []).length > 0;
  },

  async findAll(options?: { limit?: number }) {
    let query = supabaseAny.from('waiver_submissions').select('*, waiver_users(*, waiver_user_children(*))');
    if (options?.limit) query = query.limit(options.limit);
    const { data, error } = await query.order('date_signed', { ascending: false });
    if (error) throw error;
    return (data ?? []).map(mapWaiverSubmission);
  },
};

// ============= Waiver User Repository =============
export const WaiverUserRepository = {
  async findByEmail(email: string) {
    const { data, error } = await supabase
      .from('waiver_users')
      .select('*, waiver_user_children(*)')
      .eq('guardian_email', email.toLowerCase())
      .single();
    if (error && error.code !== 'PGRST116') throw error;
    // Map new schema to old interface for backward compatibility
    if (data) {
      return {
        ...data,
        email: data.guardian_email,
        phone: data.guardian_phone,
        guardian_name: `${data.guardian_first_name || ''} ${data.guardian_last_name || ''}`.trim(),
      };
    }
    return data;
  },

  async findByPhone(phone: string) {
    const { data, error } = await supabase
      .from('waiver_users')
      .select('*, waiver_user_children(*)')
      .eq('guardian_phone', phone)
      .single();
    if (error && error.code !== 'PGRST116') throw error;
    // Map new schema to old interface for backward compatibility
    if (data) {
      return {
        ...data,
        email: data.guardian_email,
        phone: data.guardian_phone,
        guardian_name: `${data.guardian_first_name || ''} ${data.guardian_last_name || ''}`.trim(),
      };
    }
    return data;
  },

  async findById(waiverUserId: number) {
    const { data, error } = await supabase
      .from('waiver_users')
      .select('*, waiver_user_children(*)')
      .eq('waiver_user_id', waiverUserId)
      .single();
    if (error && error.code !== 'PGRST116') throw error;
    // Map new schema to old interface for backward compatibility
    if (data) {
      return {
        ...data,
        email: data.guardian_email,
        phone: data.guardian_phone,
        guardian_name: `${data.guardian_first_name || ''} ${data.guardian_last_name || ''}`.trim(),
      };
    }
    return data;
  },

  async create(userData: {
    email?: string;
    phone?: string;
    guardian_name?: string;
    guardian_first_name?: string;
    guardian_last_name?: string;
    marketing_opt_in?: boolean;
  }) {
    // Parse guardian_name into first/last if provided
    let firstName = userData.guardian_first_name;
    let lastName = userData.guardian_last_name;

    if (!firstName && userData.guardian_name) {
      const parts = userData.guardian_name.trim().split(' ');
      firstName = parts[0] || 'Unknown';
      lastName = parts.slice(1).join(' ') || '';
    }

    const { data, error } = await supabase
      .from('waiver_users')
      .insert({
        guardian_email: userData.email?.toLowerCase(),
        guardian_phone: userData.phone,
        guardian_first_name: firstName || 'Unknown',
        guardian_last_name: lastName || '',
        marketing_opt_in: userData.marketing_opt_in ?? false,
      })
      .select()
      .single();
    if (error) throw error;
    // Return with backward compatible fields
    return {
      ...data,
      email: data.guardian_email,
      phone: data.guardian_phone,
      guardian_name: `${data.guardian_first_name || ''} ${data.guardian_last_name || ''}`.trim(),
    };
  },

  async update(waiverUserId: number, updates: Partial<WaiverUser>) {
    const { data, error } = await supabase
      .from('waiver_users')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('waiver_user_id', waiverUserId)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async updateChildren(waiverUserId: number, children: Array<{
    childId?: number;
    name?: string;
    first_name?: string;
    last_name?: string;
    minor_first_name?: string;
    minor_last_name?: string;
    birth_date?: string;
    minor_date_of_birth?: string;
    gender?: string;
    minor_gender?: string;
  }>) {
    // Fetch existing children for this waiver user
    const { data: existingChildren, error: fetchError } = await supabaseAny
      .from('waiver_user_children')
      .select('waiver_user_child_id')
      .eq('waiver_user_id', waiverUserId);
    if (fetchError) throw fetchError;

    const existingIds = new Set((existingChildren ?? []).map((c: { waiver_user_child_id: number }) => c.waiver_user_child_id));
    const inputIds = new Set<number>();

    // Process each child: UPDATE existing, INSERT new
    for (const c of children) {
      // Parse name into first/last if using old format
      let firstName = c.minor_first_name || c.first_name;
      let lastName = c.minor_last_name || c.last_name;

      if (!firstName && c.name) {
        const parts = c.name.trim().split(' ');
        firstName = parts[0] || 'Unknown';
        lastName = parts.slice(1).join(' ') || '';
      }

      const childData = {
        waiver_user_id: waiverUserId,
        minor_first_name: firstName || 'Unknown',
        minor_last_name: lastName || '',
        minor_date_of_birth: c.minor_date_of_birth || c.birth_date,
        minor_gender: c.minor_gender || c.gender,
      };

      if (c.childId && existingIds.has(c.childId)) {
        // UPDATE existing child
        const { error: updateError } = await supabaseAny
          .from('waiver_user_children')
          .update(childData)
          .eq('waiver_user_child_id', c.childId);
        if (updateError) throw updateError;
        inputIds.add(c.childId);
      } else {
        // INSERT new child
        const { error: insertError } = await supabaseAny
          .from('waiver_user_children')
          .insert(childData);
        if (insertError) throw insertError;
      }
    }

    // DELETE children that are no longer in the list
    for (const existingId of existingIds) {
      if (!inputIds.has(existingId)) {
        const { error: deleteError } = await supabaseAny
          .from('waiver_user_children')
          .delete()
          .eq('waiver_user_child_id', existingId);
        if (deleteError) throw deleteError;
      }
    }
  },
};

// ============= Waiver Visit Repository =============
export const WaiverVisitRepository = {
  async create(visitData: {
    waiver_user_id: number;
    waiver_submission_id?: number;
  }) {
    const { data, error } = await supabaseAny
      .from('waiver_visits')
      .insert({
        waiver_user_id: visitData.waiver_user_id,
        waiver_submission_id: visitData.waiver_submission_id,
        visited_at: new Date().toISOString(),
      })
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async findByWaiverUserId(waiverUserId: number, limit = 50) {
    const { data, error } = await supabaseAny
      .from('waiver_visits')
      .select('*')
      .eq('waiver_user_id', waiverUserId)
      .order('visited_at', { ascending: false })
      .limit(limit);
    if (error) throw error;
    return data ?? [];
  },

  async countByWaiverUserId(waiverUserId: number) {
    const { count, error } = await supabaseAny
      .from('waiver_visits')
      .select('*', { count: 'exact', head: true })
      .eq('waiver_user_id', waiverUserId);
    if (error) throw error;
    return count ?? 0;
  },
};

// ============= FAQ Repository =============
export const FAQRepository = {
  async findAll(activeOnly = true) {
    let query = supabaseAny.from('faqs').select('*');
    if (activeOnly) query = query.eq('is_active', true);
    const { data, error } = await query;
    if (error) throw error;
    return data ?? [];
  },

  async findById(faqId: number) {
    const { data, error } = await supabase
      .from('faqs')
      .select('*')
      .eq('faq_id', faqId)
      .single();
    if (error && error.code !== 'PGRST116') throw error;
    return data;
  },

  async create(faqData: { question: string; answer: string; is_active?: boolean }) {
    const { data, error } = await supabase
      .from('faqs')
      .insert(faqData)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async update(faqId: number, updates: Partial<FAQ>) {
    const { data, error } = await supabase
      .from('faqs')
      .update(updates)
      .eq('faq_id', faqId)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async delete(faqId: number) {
    const { error } = await supabaseAny.from('faqs').delete().eq('faq_id', faqId);
    if (error) throw error;
  },
};

// ============= Testimonial Repository =============
export const TestimonialRepository = {
  async findAll(featuredOnly = false) {
    let query = supabaseAny.from('testimonials').select('*');
    if (featuredOnly) query = query.eq('is_featured', true);
    const { data, error } = await query.order('created_at', { ascending: false });
    if (error) throw error;
    return data ?? [];
  },

  async findById(testimonialId: number) {
    const { data, error } = await supabase
      .from('testimonials')
      .select('*')
      .eq('testimonial_id', testimonialId)
      .single();
    if (error && error.code !== 'PGRST116') throw error;
    return data;
  },

  async create(testimonialData: {
    name: string;
    quote: string;
    rating?: number;
    is_featured?: boolean;
  }) {
    const { data, error } = await supabase
      .from('testimonials')
      .insert(testimonialData)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async update(testimonialId: number, updates: Partial<Testimonial>) {
    const { data, error } = await supabase
      .from('testimonials')
      .update(updates)
      .eq('testimonial_id', testimonialId)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async delete(testimonialId: number) {
    const { error } = await supabaseAny.from('testimonials').delete().eq('testimonial_id', testimonialId);
    if (error) throw error;
  },
};

// ============= Announcement Repository =============
export const AnnouncementRepository = {
  async findAll(activeOnly = true) {
    let query = supabaseAny.from('announcements').select('*');
    if (activeOnly) {
      const now = new Date().toISOString();
      query = query
        .eq('is_active', true)
        .or(`publish_date.is.null,publish_date.lte.${now}`)
        .or(`expires_at.is.null,expires_at.gte.${now}`);
    }
    const { data, error } = await query.order('created_at', { ascending: false });
    if (error) throw error;
    return data ?? [];
  },

  async findById(announcementId: number) {
    const { data, error } = await supabase
      .from('announcements')
      .select('*')
      .eq('announcement_id', announcementId)
      .single();
    if (error && error.code !== 'PGRST116') throw error;
    return data;
  },

  async create(announcementData: {
    title: string;
    body: string;
    is_active?: boolean;
    publish_date?: string;
    expires_at?: string;
  }) {
    const { data, error } = await supabase
      .from('announcements')
      .insert(announcementData)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async update(announcementId: number, updates: Partial<Announcement>) {
    const { data, error } = await supabase
      .from('announcements')
      .update(updates)
      .eq('announcement_id', announcementId)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async delete(announcementId: number) {
    const { error } = await supabaseAny.from('announcements').delete().eq('announcement_id', announcementId);
    if (error) throw error;
  },
};

// ============= Ticket Type Repository =============
export const TicketTypeRepository = {
  async findAll(activeOnly = true) {
    let query = supabaseAny.from('ticket_types').select('*');
    if (activeOnly) query = query.eq('is_active', true);
    const { data, error } = await query.order('base_price_usd', { ascending: true });
    if (error) throw error;
    return data ?? [];
  },

  async findById(ticketTypeId: number) {
    const { data, error } = await supabase
      .from('ticket_types')
      .select('*')
      .eq('ticket_type_id', ticketTypeId)
      .single();
    if (error && error.code !== 'PGRST116') throw error;
    return data;
  },
};

// ============= Payment Repository =============
export const PaymentRepository = {
  async findByOrderId(orderId: number) {
    const { data, error } = await supabase
      .from('payments')
      .select('*')
      .eq('order_id', orderId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data ?? [];
  },

  async findByProviderPaymentId(providerPaymentId: string) {
    const { data, error } = await supabase
      .from('payments')
      .select('*')
      .eq('provider_payment_id', providerPaymentId)
      .single();
    if (error && error.code !== 'PGRST116') throw error;
    return data;
  },

  async create(paymentData: {
    order_id: number;
    provider?: string;
    provider_payment_id?: string;
    legacy_payment_intent_id?: string; // Deprecated alias for provider_payment_id
    status?: string;
    amount_usd: number;
    receipt_url?: string | null; // Fix #16: Store Square receipt URL
  }) {
    const insertData: Record<string, unknown> = {
      order_id: paymentData.order_id,
      provider: paymentData.provider ?? 'square',
      provider_payment_id: paymentData.legacy_payment_intent_id ?? paymentData.provider_payment_id,
      status: paymentData.status ?? 'Pending',
      amount_usd: paymentData.amount_usd,
    };
    // Only include receipt_url if provided (Fix #16)
    if (paymentData.receipt_url !== undefined) {
      insertData.receipt_url = paymentData.receipt_url;
    }
    const { data, error } = await supabase
      .from('payments')
      .insert(insertData)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async update(paymentId: number, updates: Partial<Payment>) {
    const { data, error } = await supabase
      .from('payments')
      .update(updates)
      .eq('payment_id', paymentId)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async findAll(options?: { limit?: number }) {
    let query = supabaseAny.from('payments').select('*, orders(*)');
    if (options?.limit) query = query.limit(options.limit);
    const { data, error } = await query.order('created_at', { ascending: false });
    if (error) throw error;
    return data ?? [];
  },
};

// ============= Order Repository =============
export const OrderRepository = {
  async findById(orderId: number) {
    const { data, error } = await supabase
      .from('orders')
      .select('*, order_items(*), payments(*), customers(*)')
      .eq('order_id', orderId)
      .single();
    if (error && error.code !== 'PGRST116') throw error;
    return data;
  },

  async findByCustomerId(customerId: number) {
    const { data, error } = await supabase
      .from('orders')
      .select('*, order_items(*), payments(*)')
      .eq('customer_id', customerId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data ?? [];
  },

  async create(orderData: {
    customer_id?: number;
    location_id?: number;
    order_type?: string;
    status?: string;
    subtotal_usd?: number;
    discount_usd?: number;
    tax_usd?: number;
    total_usd?: number;
    notes?: string;
    promotion_id?: number | null;
    coupon_code?: string | null;
  }) {
    const { data, error } = await supabase
      .from('orders')
      .insert(orderData)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async update(orderId: number, updates: Partial<Order>) {
    const { data, error } = await supabase
      .from('orders')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('order_id', orderId)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async findAll(options?: { status?: string; orderType?: string; limit?: number }) {
    let query = supabaseAny.from('orders').select('*, order_items(*), payments(*), customers(*)');
    if (options?.status) query = query.eq('status', options.status);
    if (options?.orderType) query = query.eq('order_type', options.orderType);
    if (options?.limit) query = query.limit(options.limit);
    const { data, error } = await query.order('created_at', { ascending: false });
    if (error) throw error;
    return data ?? [];
  },

  async count(status?: string) {
    let query = supabaseAny.from('orders').select('*', { count: 'exact', head: true });
    if (status) query = query.eq('status', status);
    const { count, error } = await query;
    if (error) throw error;
    return count ?? 0;
  },
};

// ============= Order Item Repository =============
export const OrderItemRepository = {
  async findByOrderId(orderId: number) {
    const { data, error } = await supabase
      .from('order_items')
      .select('*')
      .eq('order_id', orderId);
    if (error) throw error;
    return data ?? [];
  },

  async create(itemData: {
    order_id: number;
    item_type: string;
    product_id?: number;
    ticket_type_id?: number;
    booking_id?: number;
    event_id?: number;
    name_override?: string;
    quantity: number;
    unit_price_usd: number;
    line_total_usd: number;
  }) {
    const { data, error } = await supabase
      .from('order_items')
      .insert(itemData)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async createMany(items: Array<{
    order_id: number;
    item_type: string;
    product_id?: number;
    ticket_type_id?: number;
    booking_id?: number;
    event_id?: number;
    name_override?: string;
    quantity: number;
    unit_price_usd: number;
    line_total_usd: number;
  }>) {
    const { data, error } = await supabase
      .from('order_items')
      .insert(items)
      .select();
    if (error) throw error;
    return data ?? [];
  },
};

// ============= Promotion Repository =============
export const PromotionRepository = {
  async findByCode(code: string) {
    const { data, error } = await supabase
      .from('promotions')
      .select('*')
      .eq('code', code.toUpperCase())
      .eq('is_active', true)
      .single();
    if (error && error.code !== 'PGRST116') throw error;
    return data;
  },

  async findAll(activeOnly = true) {
    let query = supabaseAny.from('promotions').select('*').order('created_at', { ascending: false });
    if (activeOnly) query = query.eq('is_active', true);
    const { data, error } = await query;
    if (error) throw error;
    return data ?? [];
  },

  async create(payload: {
    code: string;
    description?: string | null;
    percent_off?: number | null;
    amount_off_usd?: number | null;
    valid_from?: string | null;
    valid_to?: string | null;
    max_redemptions?: number | null;
    is_active?: boolean;
    applies_to?: string[] | null;
    min_purchase_usd?: number | null;
  }) {
    const { data, error } = await supabaseAny
      .from('promotions')
      .insert({
        code: payload.code.toUpperCase(),
        description: payload.description ?? null,
        percent_off: payload.percent_off ?? null,
        amount_off_usd: payload.amount_off_usd ?? null,
        valid_from: payload.valid_from ?? null,
        valid_to: payload.valid_to ?? null,
        max_redemptions: payload.max_redemptions ?? null,
        is_active: payload.is_active ?? true,
        applies_to: payload.applies_to ?? ['all'],
        min_purchase_usd: payload.min_purchase_usd ?? null,
        redemptions: 0,
      })
      .select('*')
      .single();
    if (error) throw error;
    return data;
  },

  async update(promotionId: number, updates: Partial<{
    code: string;
    description: string | null;
    percent_off: number | null;
    amount_off_usd: number | null;
    valid_from: string | null;
    valid_to: string | null;
    max_redemptions: number | null;
    is_active: boolean;
    applies_to: string[] | null;
    min_purchase_usd: number | null;
  }>) {
    const patch: Record<string, unknown> = { ...updates };
    if (typeof updates.code === 'string') patch.code = updates.code.toUpperCase();
    const { data, error } = await supabaseAny
      .from('promotions')
      .update(patch)
      .eq('promotion_id', promotionId)
      .select('*')
      .single();
    if (error) throw error;
    return data;
  },

  async delete(promotionId: number) {
    const { error } = await supabaseAny
      .from('promotions')
      .delete()
      .eq('promotion_id', promotionId);
    if (error) throw error;
    return { success: true };
  },

  async incrementRedemptions(promotionId: number) {
    const { data, error } = await supabase.rpc('increment_promotion_redemptions', {
      p_promotion_id: promotionId,
    });
    if (error) {
      // Fallback if RPC doesn't exist - use atomic increment via optimistic lock
      const msg = error.message ?? '';
      if (error.code === '42883' || error.code === 'PGRST202' || msg.includes('Could not find the function')) {
        const promo = await this.findById(promotionId);
        if (promo) {
          const currentRedemptions = promo.redemptions ?? 0;
          await supabase
            .from('promotions')
            .update({ redemptions: currentRedemptions + 1 })
            .eq('promotion_id', promotionId)
            .eq('redemptions', currentRedemptions); // Optimistic lock to prevent lost updates
        }
        return null;
      }
      throw error;
    }
    return data;
  },

  async findById(promotionId: number) {
    const { data, error } = await supabase
      .from('promotions')
      .select('*')
      .eq('promotion_id', promotionId)
      .single();
    if (error && error.code !== 'PGRST116') throw error;
    return data;
  },
};

// ============= Location Repository =============
export const LocationRepository = {
  async findAll(activeOnly = true) {
    let query = supabaseAny.from('locations').select('*');
    if (activeOnly) query = query.eq('is_active', true);
    const { data, error } = await query;
    if (error) throw error;
    return data ?? [];
  },

  async findById(locationId: number) {
    const { data, error } = await supabase
      .from('locations')
      .select('*')
      .eq('location_id', locationId)
      .single();
    if (error && error.code !== 'PGRST116') throw error;
    return data;
  },

  async findByName(name: string) {
    // Escape LIKE wildcards to prevent unintended pattern matching
    const escapedName = name.replace(/%/g, '\\%').replace(/_/g, '\\_');
    const { data, error } = await supabase
      .from('locations')
      .select('*')
      .ilike('name', `%${escapedName}%`)
      .eq('is_active', true)
      .single();
    if (error && error.code !== 'PGRST116') throw error;
    return data;
  },
};

// ============= Event Repository =============
export const EventRepository = {
  async findAll(options?: { publishedOnly?: boolean | undefined; limit?: number | undefined }) {
    let query = supabaseAny.from('events').select('*');
    if (options?.publishedOnly) query = query.eq('is_published', true);
    if (options?.limit) query = query.limit(options.limit);
    const { data, error } = await query.order('start_date', { ascending: true });
    if (error) throw error;
    return data ?? [];
  },

  async findById(eventId: number) {
    const { data, error } = await supabase
      .from('events')
      .select('*')
      .eq('event_id', eventId)
      .single();
    if (error && error.code !== 'PGRST116') throw error;
    return data;
  },

  async findUpcoming(limit?: number) {
    const now = new Date().toISOString();
    let query = supabase
      .from('events')
      .select('*')
      .eq('is_published', true)
      .gte('start_date', now)
      .order('start_date', { ascending: true });
    if (limit) query = query.limit(limit);
    const { data, error } = await query;
    if (error) throw error;
    return data ?? [];
  },

  async create(eventData: {
    title: string;
    description?: string;
    start_date: string;
    end_date: string;
    image_url?: string;
    is_published?: boolean;
  }) {
    const { data, error } = await supabase
      .from('events')
      .insert(eventData)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async update(eventId: number, updates: Partial<Event>) {
    const { data, error } = await supabase
      .from('events')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('event_id', eventId)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async delete(eventId: number) {
    const { error } = await supabaseAny.from('events').delete().eq('event_id', eventId);
    if (error) throw error;
  },
};

// ============= Membership Plan Repository =============
export const MembershipPlanRepository = {
  async findAll(activeOnly = true) {
    return logDbOperation('findAll', 'membership_plans', async () => {
      let query = supabaseAny.from('membership_plans').select('*');
      if (activeOnly) query = query.eq('is_active', true);
      const { data, error } = await query.order('monthly_price', { ascending: true });
      if (error) throw error;
      return data ?? [];
    });
  },

  async findById(planId: number) {
    const { data, error } = await supabase
      .from('membership_plans')
      .select('*')
      .eq('plan_id', planId)
      .single();
    if (error && error.code !== 'PGRST116') throw error;
    return data;
  },

  async findByName(name: string) {
    const { data, error } = await supabase
      .from('membership_plans')
      .select('*')
      .ilike('name', name)
      .single();
    if (error && error.code !== 'PGRST116') throw error;
    return data;
  },

  async create(planData: {
    name: string;
    description?: string;
    monthly_price: number;
    benefits?: string[];
    max_children?: number;
    visits_per_month?: number;
    discount_percent?: number;
    guest_passes_per_month?: number;
    is_active?: boolean;
  }) {
    const { data, error } = await supabase
      .from('membership_plans')
      .insert(planData)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async update(planId: number, updates: Partial<MembershipPlan>) {
    const { data, error } = await supabase
      .from('membership_plans')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('plan_id', planId)
      .select()
      .single();
    if (error) throw error;
    return data;
  },
};

// ============= Ticket Purchase Repository =============
export const TicketPurchaseRepository = {
  async findById(purchaseId: number) {
    const { data, error } = await supabase
      .from('ticket_purchases')
      .select('*, customers(*), events(*), ticket_types(*)')
      .eq('purchase_id', purchaseId)
      .single();
    if (error && error.code !== 'PGRST116') throw error;
    return data;
  },

  async findByCustomerId(customerId: number) {
    const { data, error } = await supabase
      .from('ticket_purchases')
      .select('*, events(*), ticket_types(*)')
      .eq('customer_id', customerId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data ?? [];
  },

  async findByCode(code: string) {
    // Use Postgres jsonb containment (`codes @> '[{"code":"PF-..."}]'::jsonb`).
    // We call `.filter(column, 'cs', value)` directly instead of `.contains()`
    // because postgrest-js serializes a JS array passed to `.contains()` as a
    // Postgres array literal (`{...}`), which Postgres then rejects on a jsonb
    // column with "invalid input syntax for type json". Passing the value as a
    // pre-stringified JSON array sends it as valid jsonb and uses the `@>`
    // operator — index-friendly if a GIN index exists on `codes`, and immune
    // to whitespace/ordering issues in the stored jsonb.
    const containsValue = JSON.stringify([{ code }]);
    const { data, error } = await supabase
      .from('ticket_purchases')
      .select('*, events(*), ticket_types(*), customers(*)')
      .filter('codes', 'cs', containsValue)
      .limit(1);
    if (error) throw error;
    return data?.[0] ?? null;
  },

  async create(purchaseData: {
    customer_id: number;
    ticket_type_id?: number;
    event_id?: number;
    ticket_type?: string;
    quantity: number;
    unit_price: number;
    total: number;
    codes: { code: string; status: string; redeemedAt?: string }[];
    status?: string;
    metadata?: Record<string, unknown>;
    provider_payment_id?: string;
  }) {
    const { data, error } = await supabase
      .from('ticket_purchases')
      .insert(purchaseData)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async update(purchaseId: number, updates: Partial<TicketPurchase>) {
    const { data, error } = await supabase
      .from('ticket_purchases')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('purchase_id', purchaseId)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async redeemCode(purchaseId: number, code: string) {
    const purchase = await this.findById(purchaseId);
    if (!purchase) throw new Error('Purchase not found');

    // Parse codes if it's a string (from database)
    const existingCodes = typeof purchase.codes === 'string'
      ? JSON.parse(purchase.codes)
      : (purchase.codes ?? []);

    const updatedCodes = existingCodes.map((c: { code: string; status: string; redeemedAt?: string }) =>
      c.code === code ? { ...c, status: 'redeemed', redeemedAt: new Date().toISOString() } : c
    );

    // Update with the codes array - Supabase handles JSON serialization
    const { data, error } = await supabase
      .from('ticket_purchases')
      .update({ codes: updatedCodes, updated_at: new Date().toISOString() })
      .eq('purchase_id', purchaseId)
      .select('*, customers(*)')
      .single();

    if (error) throw error;
    return data;
  },

  async findAll(options?: { status?: string | undefined; limit?: number | undefined }) {
    let query = supabase
      .from('ticket_purchases')
      .select('*, customers(*), events(*)');
    if (options?.status) query = query.eq('status', options.status);
    if (options?.limit) query = query.limit(options.limit);
    const { data, error } = await query.order('created_at', { ascending: false });
    if (error) throw error;
    return data ?? [];
  },

  async delete(purchaseId: number) {
    const { error } = await supabase
      .from('ticket_purchases')
      .delete()
      .eq('purchase_id', purchaseId);
    if (error) throw error;
    return true;
  },
};

// ============= App Payment Repository =============
export const AppPaymentRepository = {
  async findById(paymentId: number) {
    const { data, error } = await supabase
      .from('app_payments')
      .select('*, customers(*)')
      .eq('app_payment_id', paymentId)
      .single();
    if (error && error.code !== 'PGRST116') throw error;
    return data;
  },

  async findByProviderPaymentId(providerPaymentId: string) {
    const { data, error } = await supabase
      .from('app_payments')
      .select('*, customers(*)')
      .eq('provider_payment_id', providerPaymentId)
      .single();
    if (error && error.code !== 'PGRST116') throw error;
    return data;
  },

  async findByCustomerId(customerId: number) {
    const { data, error } = await supabase
      .from('app_payments')
      .select('*')
      .eq('customer_id', customerId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data ?? [];
  },

  async create(paymentData: {
    customer_id: number;
    amount: number;
    currency?: string;
    status?: string;
    provider_payment_id: string;
    purpose: string;
    metadata?: Record<string, unknown>;
  }) {
    const { data, error } = await supabase
      .from('app_payments')
      .insert(paymentData)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async update(paymentId: number, updates: Partial<AppPayment>) {
    const { data, error } = await supabase
      .from('app_payments')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('app_payment_id', paymentId)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async updateByProviderId(providerPaymentId: string, updates: Partial<AppPayment>) {
    const { data, error } = await supabase
      .from('app_payments')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('provider_payment_id', providerPaymentId)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async findAll(options?: { purpose?: string | undefined; status?: string | undefined; limit?: number | undefined }) {
    let query = supabaseAny.from('app_payments').select('*, customers(*)');
    if (options?.purpose) query = query.eq('purpose', options.purpose);
    if (options?.status) query = query.eq('status', options.status);
    if (options?.limit) query = query.limit(options.limit);
    const { data, error } = await query.order('created_at', { ascending: false });
    if (error) throw error;
    return data ?? [];
  },
};

// ============= Waiver Submission Repository =============
export const WaiverSubmissionRepository = {
  async findById(submissionId: number) {
    const { data, error } = await supabase
      .from('waiver_submissions')
      .select('*, customers(*), waiver_users(*)')
      .eq('submission_id', submissionId)
      .single();
    if (error && error.code !== 'PGRST116') throw error;
    return data ? mapWaiverSubmission(data) : null;
  },

  async findByCustomerId(customerId: number) {
    const { data, error } = await supabase
      .from('waiver_submissions')
      .select('*')
      .eq('customer_id', customerId)
      .order('date_signed', { ascending: false });
    if (error) throw error;
    return (data ?? []).map(mapWaiverSubmission);
  },

  async findByWaiverUserId(waiverUserId: number) {
    const { data, error } = await supabase
      .from('waiver_submissions')
      .select('*')
      .eq('waiver_user_id', waiverUserId)
      .order('date_signed', { ascending: false });
    if (error) throw error;
    return (data ?? []).map(mapWaiverSubmission);
  },

  async findValidByEmail(email: string) {
    const now = new Date().toISOString();
    const { data, error } = await supabase
      .from('waiver_submissions')
      .select('*')
      .eq('guardian_email', email.toLowerCase())
      .or(`expires_at.is.null,expires_at.gte.${now}`)
      .order('date_signed', { ascending: false })
      .limit(1)
      .single();
    if (error && error.code !== 'PGRST116') throw error;
    return data ? mapWaiverSubmission(data) : null;
  },

  async create(waiverData: {
    customer_id?: number;
    waiver_user_id?: number;
    guardian_name?: string;
    guardian_first_name?: string;
    guardian_last_name?: string;
    guardian_email?: string;
    guardian_phone?: string;
    guardian_date_of_birth?: string;
    relationship_to_children?: string;
    relationship_to_minor?: string;
    child_ids?: number[];
    signature?: string;
    digital_signature?: string;
    accepted_policies: string[];
    marketing_opt_in?: boolean;
    marketing_sms_opt_in?: boolean;
    marketing_email_opt_in?: boolean;
    expires_at?: string;
    archive_until?: string;
    ip_address?: string;
    signature_image_url?: string;
  }) {
    // Parse guardian_name into first/last if provided
    let firstName = waiverData.guardian_first_name;
    let lastName = waiverData.guardian_last_name;

    if (!firstName && waiverData.guardian_name) {
      const parts = waiverData.guardian_name.trim().split(' ');
      firstName = parts[0] || 'Unknown';
      lastName = parts.slice(1).join(' ') || '';
    }

    const insertData: Record<string, unknown> = {
      customer_id: waiverData.customer_id,
      waiver_user_id: waiverData.waiver_user_id,
      guardian_first_name: firstName || 'Unknown',
      guardian_last_name: lastName || '',
      guardian_email: waiverData.guardian_email?.toLowerCase(),
      guardian_phone: waiverData.guardian_phone,
      guardian_date_of_birth: waiverData.guardian_date_of_birth,
      relationship_to_minor: waiverData.relationship_to_minor || waiverData.relationship_to_children,
      child_ids: waiverData.child_ids,
      digital_signature: waiverData.digital_signature || waiverData.signature || '',
      waiver_agreement_accepted: true,
      accepted_policies: waiverData.accepted_policies,
      marketing_sms_opt_in: waiverData.marketing_sms_opt_in ?? waiverData.marketing_opt_in ?? false,
      marketing_email_opt_in: waiverData.marketing_email_opt_in ?? waiverData.marketing_opt_in ?? false,
      expires_at: waiverData.expires_at,
      archive_until: waiverData.archive_until,
      ip_address: waiverData.ip_address,
      signature_image_url: waiverData.signature_image_url,
    };

    const { data, error } = await supabase
      .from('waiver_submissions')
      .insert(insertData)
      .select()
      .single();
    if (error) throw error;
    return mapWaiverSubmission(data);
  },

  async findAll(options?: { limit?: number | undefined }) {
    let query = supabaseAny.from('waiver_submissions').select('*, customers(*), waiver_users(*, waiver_user_children(*))');
    if (options?.limit) query = query.limit(options.limit);
    const { data, error } = await query.order('date_signed', { ascending: false });
    if (error) throw error;
    return (data ?? []).map(mapWaiverSubmission);
  },

  async update(
    submissionId: number,
    updates: Partial<{
      guardian_first_name: string | null;
      guardian_last_name: string | null;
      guardian_email: string | null;
      guardian_phone: string | null;
      guardian_date_of_birth: string | null;
      relationship_to_minor: string | null;
      marketing_sms_opt_in: boolean | null;
      marketing_email_opt_in: boolean | null;
      expires_at: string | null;
      date_signed: string | null;
      archive_until: string | null;
      waiver_code: string | null;
    }>,
  ) {
    const normalizedUpdates = {
      ...updates,
      updated_at: new Date().toISOString(),
    } as Record<string, unknown>;

    if (typeof updates.guardian_email === 'string') {
      normalizedUpdates.guardian_email = updates.guardian_email.toLowerCase();
    }

    const { data, error } = await supabase
      .from('waiver_submissions')
      .update(normalizedUpdates)
      .eq('submission_id', submissionId)
      .select('*, customers(*), waiver_users(*)')
      .single();
    if (error) throw error;
    return mapWaiverSubmission(data);
  },
};

// ============= Party Add-On Repository =============
export const PartyAddOnRepository = {
  async findAll(activeOnly = true) {
    let query = supabaseAny.from('party_add_ons').select('*');
    if (activeOnly) query = query.eq('is_active', true);
    const { data, error } = await query.order('display_order', { ascending: true });
    if (error) throw error;
    return (data ?? []) as PartyAddOn[];
  },

  async findByCode(code: string) {
    const { data, error } = await supabase
      .from('party_add_ons')
      .select('*')
      .eq('code', code)
      .eq('is_active', true)
      .single();
    if (error && error.code !== 'PGRST116') throw error;
    return data as PartyAddOn | null;
  },

  async findById(addOnId: number) {
    const { data, error } = await supabase
      .from('party_add_ons')
      .select('*')
      .eq('add_on_id', addOnId)
      .single();
    if (error && error.code !== 'PGRST116') throw error;
    return data as PartyAddOn | null;
  },

  async create(addOnData: {
    code: string;
    label: string;
    description?: string;
    price: number;
    price_type: 'flat' | 'perChild' | 'duration';
    is_active?: boolean;
    display_order?: number;
  }) {
    const { data, error } = await supabase
      .from('party_add_ons')
      .insert(addOnData)
      .select()
      .single();
    if (error) throw error;
    return data as PartyAddOn;
  },

  async update(addOnId: number, updates: Partial<PartyAddOn>) {
    const { data, error } = await supabase
      .from('party_add_ons')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('add_on_id', addOnId)
      .select()
      .single();
    if (error) throw error;
    return data as PartyAddOn;
  },
};

// ============= Payment Log Repository =============
export interface PaymentLog {
  log_id: number;
  idempotency_key: string;
  payment_id: string | null;
  order_id: string | null;
  customer_id: number | null;
  user_id: number | null;
  booking_id: number | null;
  provider: string;
  payment_type: string;
  amount_usd: number;
  currency: string;
  status: string;
  previous_status: string | null;
  source_type: string | null;
  location_id: string | null;
  reference_id: string | null;
  response_code: string | null;
  error_category: string | null;
  error_code: string | null;
  error_detail: string | null;
  error_field: string | null;
  square_receipt_number: string | null;
  square_receipt_url: string | null;
  card_brand: string | null;
  card_last4: string | null;
  card_exp_month: number | null;
  card_exp_year: number | null;
  entry_method: string | null;
  cvv_status: string | null;
  avs_status: string | null;
  risk_level: string | null;
  risk_score: number | null;
  verification_method: string | null;
  processing_time_ms: number | null;
  request_payload: Record<string, unknown> | null;
  response_payload: Record<string, unknown> | null;
  ip_address: string | null;
  user_agent: string | null;
  session_id: string | null;
  metadata: Record<string, unknown>;
  initiated_at: string;
  completed_at: string | null;
  created_at: string;
}

export const PaymentLogRepository = {
  async create(logData: {
    idempotency_key: string;
    payment_id?: string;
    order_id?: string;
    customer_id?: number | null;
    user_id?: number | null;
    booking_id?: number | null;
    provider?: string;
    payment_type: string;
    amount_usd: number;
    currency?: string;
    status: string;
    previous_status?: string;
    source_type?: string;
    location_id?: string;
    reference_id?: string;
    response_code?: string;
    error_category?: string;
    error_code?: string;
    error_detail?: string;
    error_field?: string;
    square_receipt_number?: string;
    square_receipt_url?: string;
    card_brand?: string;
    card_last4?: string;
    card_exp_month?: number;
    card_exp_year?: number;
    entry_method?: string;
    cvv_status?: string;
    avs_status?: string;
    risk_level?: string;
    risk_score?: number;
    verification_method?: string;
    processing_time_ms?: number;
    request_payload?: Record<string, unknown>;
    response_payload?: Record<string, unknown>;
    ip_address?: string;
    user_agent?: string;
    session_id?: string;
    metadata?: Record<string, unknown>;
    initiated_at?: string;
    completed_at?: string;
  }) {
    // Use supabaseAny since 'payment_logs' table isn't in the generated types yet
    const { data, error } = await supabaseAny
      .from('payment_logs')
      .insert({
        idempotency_key: logData.idempotency_key,
        payment_id: logData.payment_id ?? null,
        order_id: logData.order_id ?? null,
        customer_id: logData.customer_id ?? null,
        user_id: logData.user_id ?? null,
        booking_id: logData.booking_id ?? null,
        provider: logData.provider ?? 'square',
        payment_type: logData.payment_type,
        amount_usd: logData.amount_usd,
        currency: logData.currency ?? 'USD',
        status: logData.status,
        previous_status: logData.previous_status ?? null,
        source_type: logData.source_type ?? null,
        location_id: logData.location_id ?? null,
        reference_id: logData.reference_id ?? null,
        response_code: logData.response_code ?? null,
        error_category: logData.error_category ?? null,
        error_code: logData.error_code ?? null,
        error_detail: logData.error_detail ?? null,
        error_field: logData.error_field ?? null,
        square_receipt_number: logData.square_receipt_number ?? null,
        square_receipt_url: logData.square_receipt_url ?? null,
        card_brand: logData.card_brand ?? null,
        card_last4: logData.card_last4 ?? null,
        card_exp_month: logData.card_exp_month ?? null,
        card_exp_year: logData.card_exp_year ?? null,
        entry_method: logData.entry_method ?? null,
        cvv_status: logData.cvv_status ?? null,
        avs_status: logData.avs_status ?? null,
        risk_level: logData.risk_level ?? null,
        risk_score: logData.risk_score ?? null,
        verification_method: logData.verification_method ?? null,
        processing_time_ms: logData.processing_time_ms ?? null,
        request_payload: logData.request_payload ?? null,
        response_payload: logData.response_payload ?? null,
        ip_address: logData.ip_address ?? null,
        user_agent: logData.user_agent ?? null,
        session_id: logData.session_id ?? null,
        metadata: logData.metadata ?? {},
        initiated_at: logData.initiated_at ?? new Date().toISOString(),
        completed_at: logData.completed_at ?? null,
      })
      .select()
      .single();
    if (error) throw error;
    return data as PaymentLog;
  },

  async update(logId: number, updates: Partial<Omit<PaymentLog, 'log_id' | 'created_at'>>) {
    // Use supabaseAny since 'payment_logs' table isn't in the generated types yet
    const { data, error } = await supabaseAny
      .from('payment_logs')
      .update(updates)
      .eq('log_id', logId)
      .select()
      .single();
    if (error) throw error;
    return data as PaymentLog;
  },

  async findByIdempotencyKey(idempotencyKey: string) {
    // Use supabaseAny since 'payment_logs' table isn't in the generated types yet
    const { data, error } = await supabaseAny
      .from('payment_logs')
      .select('*')
      .eq('idempotency_key', idempotencyKey)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();
    if (error && error.code !== 'PGRST116') throw error;
    return data as PaymentLog | null;
  },

  async findByPaymentId(paymentId: string) {
    // Use supabaseAny since 'payment_logs' table isn't in the generated types yet
    const { data, error } = await supabaseAny
      .from('payment_logs')
      .select('*')
      .eq('payment_id', paymentId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data ?? []) as PaymentLog[];
  },

  async findByBookingId(bookingId: number) {
    // Use supabaseAny since 'payment_logs' table isn't in the generated types yet
    const { data, error } = await supabaseAny
      .from('payment_logs')
      .select('*')
      .eq('booking_id', bookingId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data ?? []) as PaymentLog[];
  },

  async findByCustomerId(customerId: number, limit = 50) {
    // Use supabaseAny since 'payment_logs' table isn't in the generated types yet
    const { data, error } = await supabaseAny
      .from('payment_logs')
      .select('*')
      .eq('customer_id', customerId)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) throw error;
    return (data ?? []) as PaymentLog[];
  },

  async findFailedPayments(limit = 100) {
    // Use supabaseAny since 'payment_logs' table isn't in the generated types yet
    const { data, error } = await supabaseAny
      .from('payment_logs')
      .select('*')
      .eq('status', 'failed')
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) throw error;
    return (data ?? []) as PaymentLog[];
  },

  async findRecentLogs(limit = 100) {
    // Use supabaseAny since 'payment_logs' table isn't in the generated types yet
    const { data, error } = await supabaseAny
      .from('payment_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) throw error;
    return (data ?? []) as PaymentLog[];
  },
};

// ============= Receipt Repository =============
export interface Receipt {
  receipt_id: number;
  receipt_number: string;
  customer_id: number | null;
  purchase_type: 'membership' | 'ticket' | 'booking';
  reference_id: number;
  subtotal_usd: number;
  discount_usd: number;
  tax_usd: number;
  total_usd: number;
  payment_method: string | null;
  payment_id: string | null;
  verification_hash: string;
  metadata: Record<string, unknown>;
  created_at: string;
}

export const ReceiptRepository = {
  async create(receiptData: {
    receipt_number: string;
    customer_id?: number | null;
    purchase_type: 'membership' | 'ticket' | 'booking';
    reference_id: number;
    subtotal_usd: number;
    discount_usd?: number;
    tax_usd?: number;
    total_usd: number;
    payment_method?: string;
    payment_id?: string;
    verification_hash: string;
    metadata?: Record<string, unknown>;
    created_at?: string;
  }) {
    // Use supabaseAny since 'receipts' table isn't in the generated types yet
    const insertData: Record<string, unknown> = {
      receipt_number: receiptData.receipt_number,
      customer_id: receiptData.customer_id ?? null,
      purchase_type: receiptData.purchase_type,
      reference_id: receiptData.reference_id,
      subtotal_usd: receiptData.subtotal_usd,
      discount_usd: receiptData.discount_usd ?? 0,
      tax_usd: receiptData.tax_usd ?? 0,
      total_usd: receiptData.total_usd,
      payment_method: receiptData.payment_method ?? null,
      payment_id: receiptData.payment_id ?? null,
      verification_hash: receiptData.verification_hash,
      metadata: receiptData.metadata ?? {},
    };
    // Explicitly set created_at to match the verification hash
    if (receiptData.created_at) {
      insertData.created_at = receiptData.created_at;
    }
    const { data, error } = await supabaseAny
      .from('receipts')
      .insert(insertData)
      .select()
      .single();
    if (error) throw error;
    return data as Receipt;
  },

  async findByReceiptNumber(receiptNumber: string) {
    // Use supabaseAny since 'receipts' table isn't in the generated types yet
    const { data, error } = await supabaseAny
      .from('receipts')
      .select('*, customers(*)')
      .eq('receipt_number', receiptNumber)
      .single();
    if (error && error.code !== 'PGRST116') throw error;
    return data as (Receipt & { customers: Customer | null }) | null;
  },

  async findByCustomerId(customerId: number) {
    // Use supabaseAny since 'receipts' table isn't in the generated types yet
    const { data, error } = await supabaseAny
      .from('receipts')
      .select('*')
      .eq('customer_id', customerId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data ?? []) as Receipt[];
  },

  async findById(receiptId: number) {
    // Use supabaseAny since 'receipts' table isn't in the generated types yet
    const { data, error } = await supabaseAny
      .from('receipts')
      .select('*, customers(*)')
      .eq('receipt_id', receiptId)
      .single();
    if (error && error.code !== 'PGRST116') throw error;
    return data as (Receipt & { customers: Customer | null }) | null;
  },

  async findByPurchase(purchaseType: 'membership' | 'ticket' | 'booking', referenceId: number) {
    // Use supabaseAny since 'receipts' table isn't in the generated types yet
    const { data, error } = await supabaseAny
      .from('receipts')
      .select('*')
      .eq('purchase_type', purchaseType)
      .eq('reference_id', referenceId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();
    if (error && error.code !== 'PGRST116') throw error;
    return data as Receipt | null;
  },

  async findByPaymentId(paymentId: string) {
    // Find all receipts associated with a payment ID
    const { data, error } = await supabaseAny
      .from('receipts')
      .select('*')
      .eq('payment_id', paymentId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data ?? []) as Receipt[];
  },
};

// ============= Pricing Config Repository =============
export const PricingConfigRepository = {
  async findAll(activeOnly = true) {
    let query = supabaseAny.from('pricing_config').select('*');
    if (activeOnly) query = query.eq('is_active', true);
    const { data, error } = await query;
    if (error) throw error;
    return (data ?? []) as PricingConfig[];
  },

  async findByKey(key: string) {
    const { data, error } = await supabase
      .from('pricing_config')
      .select('*')
      .eq('config_key', key)
      .eq('is_active', true)
      .single();
    if (error && error.code !== 'PGRST116') throw error;
    return data as PricingConfig | null;
  },

  async getValue(key: string, defaultValue = 0): Promise<number> {
    const config = await this.findByKey(key);
    return config?.config_value ?? defaultValue;
  },

  async update(key: string, value: number) {
    const { data, error } = await supabase
      .from('pricing_config')
      .update({ config_value: value, updated_at: new Date().toISOString() })
      .eq('config_key', key)
      .select()
      .single();
    if (error) throw error;
    return data as PricingConfig;
  },

  async upsert(key: string, value: number, description?: string) {
    const { data, error } = await supabase
      .from('pricing_config')
      .upsert({
        config_key: key,
        config_value: value,
        description,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'config_key' })
      .select()
      .single();
    if (error) throw error;
    return data as PricingConfig;
  },
};

// ============= Store Hours Repository =============
export interface StoreHours {
  id: number;
  location_name: string;
  day_of_week: number; // 0 = Sunday, 6 = Saturday
  open_time: string;   // HH:MM format
  close_time: string;  // HH:MM format
  is_closed: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// Cache for store hours to avoid repeated DB calls (per-location timestamps)
let cachedStoreHours: Map<string, { data: StoreHours[]; fetchedAt: number }> | null = null;
const STORE_HOURS_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export const StoreHoursRepository = {
  /**
   * Clear the store hours cache (e.g., after admin update)
   */
  clearCache() {
    cachedStoreHours = null;
  },

  /**
   * Find all store hours for a location
   */
  async findByLocation(locationName: string): Promise<StoreHours[]> {
    // Check cache first (per-location TTL)
    if (cachedStoreHours) {
      const cached = cachedStoreHours.get(locationName);
      if (cached && Date.now() - cached.fetchedAt < STORE_HOURS_CACHE_TTL) {
        return cached.data;
      }
    }

    const { data, error } = await supabaseAny
      .from('store_hours')
      .select('*')
      .eq('location_name', locationName)
      .eq('is_active', true)
      .order('day_of_week', { ascending: true });

    if (error) throw error;

    const hours = (data ?? []) as StoreHours[];

    // Update cache with per-location timestamp
    if (!cachedStoreHours) cachedStoreHours = new Map();
    cachedStoreHours.set(locationName, { data: hours, fetchedAt: Date.now() });

    return hours;
  },

  /**
   * Get hours for a specific day at a location
   */
  async findByLocationAndDay(locationName: string, dayOfWeek: number): Promise<StoreHours | null> {
    const allHours = await this.findByLocation(locationName);
    return allHours.find(h => h.day_of_week === dayOfWeek) ?? null;
  },

  /**
   * Get all store hours (for admin)
   */
  async findAll(): Promise<StoreHours[]> {
    const { data, error } = await supabaseAny
      .from('store_hours')
      .select('*')
      .eq('is_active', true)
      .order('location_name', { ascending: true })
      .order('day_of_week', { ascending: true });

    if (error) throw error;
    return (data ?? []) as StoreHours[];
  },

  /**
   * Update store hours for a location/day
   */
  async update(id: number, updates: Partial<Omit<StoreHours, 'id' | 'created_at'>>): Promise<StoreHours> {
    const { data, error } = await supabaseAny
      .from('store_hours')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    this.clearCache();
    return data as StoreHours;
  },

  /**
   * Upsert store hours (create or update)
   */
  async upsert(hoursData: {
    location_name: string;
    day_of_week: number;
    open_time: string;
    close_time: string;
    is_closed?: boolean;
  }): Promise<StoreHours> {
    const { data, error } = await supabaseAny
      .from('store_hours')
      .upsert({
        location_name: hoursData.location_name,
        day_of_week: hoursData.day_of_week,
        open_time: hoursData.open_time,
        close_time: hoursData.close_time,
        is_closed: hoursData.is_closed ?? false,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'location_name,day_of_week' })
      .select()
      .single();

    if (error) throw error;
    this.clearCache();
    return data as StoreHours;
  },
};

// ============= Job Listing Repository =============
export const JobListingRepository = {
  async findAllActive() {
    const { data, error } = await supabaseAny
      .from('job_listings')
      .select('*')
      .eq('is_active', true)
      .or('closes_at.is.null,closes_at.gte.' + new Date().toISOString())
      .order('display_order', { ascending: true });
    if (error) throw error;
    return data ?? [];
  },

  async findById(listingId: number) {
    const { data, error } = await supabaseAny
      .from('job_listings')
      .select('*')
      .eq('listing_id', listingId)
      .single();
    if (error && error.code !== 'PGRST116') throw error;
    return data;
  },

  async findBySlug(slug: string) {
    const { data, error } = await supabaseAny
      .from('job_listings')
      .select('*')
      .eq('slug', slug)
      .eq('is_active', true)
      .single();
    if (error && error.code !== 'PGRST116') throw error;
    return data;
  },

  async findAll() {
    const { data, error } = await supabaseAny
      .from('job_listings')
      .select('listing_id, title')
      .order('display_order', { ascending: true });
    if (error) throw error;
    return data ?? [];
  },

  async findAllForAdmin(options?: {
    isActive?: boolean;
    search?: string;
    limit?: number;
    offset?: number;
  }) {
    let query = supabaseAny
      .from('job_listings')
      .select('*', { count: 'exact' });

    if (options?.isActive !== undefined) query = query.eq('is_active', options.isActive);
    if (options?.search) {
      const s = options.search.replace(/%/g, '\\%').replace(/_/g, '\\_').trim();
      query = query.or(`title.ilike.%${s}%,department.ilike.%${s}%,slug.ilike.%${s}%`);
    }

    const limit = options?.limit ?? 100;
    const offset = options?.offset ?? 0;
    query = query.range(offset, offset + limit - 1);
    query = query
      .order('is_active', { ascending: false })
      .order('display_order', { ascending: true })
      .order('created_at', { ascending: false });

    const { data, error, count } = await query;
    if (error) throw error;
    return { data: data ?? [], count: count ?? 0 };
  },

  async create(input: Record<string, unknown>) {
    const { data, error } = await supabaseAny
      .from('job_listings')
      .insert(input)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async update(listingId: number, input: Record<string, unknown>) {
    const payload = { ...input, updated_at: new Date().toISOString() };
    const { data, error } = await supabaseAny
      .from('job_listings')
      .update(payload)
      .eq('listing_id', listingId)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async deleteById(listingId: number) {
    const { error } = await supabaseAny
      .from('job_listings')
      .delete()
      .eq('listing_id', listingId);
    if (error) throw error;
  },

  async countApplications(listingId: number): Promise<number> {
    const { count, error } = await supabaseAny
      .from('job_applications')
      .select('*', { count: 'exact', head: true })
      .eq('listing_id', listingId);
    if (error) throw error;
    return count ?? 0;
  },
};

// ============= Job Application Repository =============
export const JobApplicationRepository = {
  async create(applicationData: {
    listing_id: number;
    first_name: string;
    last_name: string;
    email: string;
    phone: string;
    date_of_birth: string | null;
    resume_storage_path: string | null;
    resume_original_name: string | null;
    resume_mime_type: string | null;
    resume_size_bytes: number | null;
    cover_letter: string | null;
    schedule_preference: string | null;
    available_start_date: string | null;
    has_experience_with_children: boolean;
    gender: string | null;
    pronouns: string | null;
    how_heard: string | null;
    emergency_contact_name: string | null;
    emergency_contact_phone: string | null;
    ip_address: string | null;
    video_url: string | null;
    video_storage_path: string | null;
    video_original_name: string | null;
    video_mime_type: string | null;
    video_size_bytes: number | null;
  }) {
    const { data, error } = await supabaseAny
      .from('job_applications')
      .insert(applicationData)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async checkDuplicateApplication(email: string, listingId: number): Promise<boolean> {
    const { count, error } = await supabaseAny
      .from('job_applications')
      .select('*', { count: 'exact', head: true })
      .eq('email', email.toLowerCase())
      .eq('listing_id', listingId);
    if (error) throw error;
    return (count ?? 0) > 0;
  },

  async findByListing(listingId: number) {
    const { data, error } = await supabaseAny
      .from('job_applications')
      .select('*, job_listings(*)')
      .eq('listing_id', listingId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data ?? [];
  },

  async findAll(options?: {
    status?: string;
    listingId?: number;
    search?: string;
    dateFrom?: string;
    dateTo?: string;
    limit?: number;
    offset?: number;
  }) {
    let query = supabaseAny
      .from('job_applications')
      .select('*, job_listings(listing_id, title)', { count: 'exact' });

    if (options?.status) query = query.eq('status', options.status);
    if (options?.listingId) query = query.eq('listing_id', options.listingId);
    if (options?.search) {
      const s = options.search.replace(/%/g, '\\%').replace(/_/g, '\\_').trim();
      query = query.or(`first_name.ilike.%${s}%,last_name.ilike.%${s}%,email.ilike.%${s}%`);
    }
    if (options?.dateFrom) query = query.gte('created_at', `${options.dateFrom}T00:00:00`);
    if (options?.dateTo) query = query.lte('created_at', `${options.dateTo}T23:59:59`);

    const limit = options?.limit ?? 50;
    const offset = options?.offset ?? 0;
    query = query.range(offset, offset + limit - 1);
    query = query.order('created_at', { ascending: false });

    const { data, error, count } = await query;
    if (error) throw error;
    return { data: data ?? [], count: count ?? 0 };
  },

  async findById(applicationId: number) {
    const { data, error } = await supabaseAny
      .from('job_applications')
      .select('*, job_listings(*)')
      .eq('application_id', applicationId)
      .single();
    if (error && error.code !== 'PGRST116') throw error;
    return data;
  },

  async updateStatus(applicationId: number, status: string, adminNotes?: string) {
    const updates: Record<string, unknown> = {
      status,
      updated_at: new Date().toISOString(),
    };
    if (adminNotes !== undefined) updates.admin_notes = adminNotes;

    const { data, error } = await supabaseAny
      .from('job_applications')
      .update(updates)
      .eq('application_id', applicationId)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async update(applicationId: number, updates: Record<string, unknown>) {
    const payload = { ...updates, updated_at: new Date().toISOString() };
    const { data, error } = await supabaseAny
      .from('job_applications')
      .update(payload)
      .eq('application_id', applicationId)
      .select('*, job_listings(*)')
      .single();
    if (error) throw error;
    return data;
  },

  async deleteById(applicationId: number) {
    const { error } = await supabaseAny
      .from('job_applications')
      .delete()
      .eq('application_id', applicationId);
    if (error) throw error;
  },
};

// ============= Event Photo Repository =============
export const EventPhotoRepository = {
  async findByEventId(eventId: number) {
    const { data, error } = await supabaseAny
      .from('event_photos')
      .select('*')
      .eq('event_id', eventId)
      .order('display_order', { ascending: true })
      .order('created_at', { ascending: true });
    if (error) throw error;
    return data ?? [];
  },

  async create(photoData: {
    event_id: number;
    photo_url: string;
    storage_path: string;
    caption?: string | null;
    display_order?: number;
    media_type?: 'image' | 'video';
  }) {
    const { data, error } = await supabaseAny
      .from('event_photos')
      .insert(photoData)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async delete(photoId: number) {
    // First get the storage_path for cleanup
    const { data: photo, error: findError } = await supabaseAny
      .from('event_photos')
      .select('storage_path')
      .eq('photo_id', photoId)
      .single();
    if (findError && findError.code !== 'PGRST116') throw findError;
    if (!photo) return null;

    const { error } = await supabaseAny
      .from('event_photos')
      .delete()
      .eq('photo_id', photoId);
    if (error) throw error;
    return photo.storage_path as string;
  },

  async deleteByEventId(eventId: number) {
    // First get all storage paths for cleanup
    const { data: photos, error: findError } = await supabaseAny
      .from('event_photos')
      .select('storage_path')
      .eq('event_id', eventId);
    if (findError) throw findError;

    const storagePaths = (photos ?? []).map((p: { storage_path: string }) => p.storage_path);

    if (storagePaths.length > 0) {
      const { error } = await supabaseAny
        .from('event_photos')
        .delete()
        .eq('event_id', eventId);
      if (error) throw error;
    }

    return storagePaths;
  },

  async getEventIdsWithMedia(): Promise<number[]> {
    const { data, error } = await supabaseAny
      .from('event_photos')
      .select('event_id');
    if (error) throw error;
    const ids = (data ?? []).map((row: { event_id: number }) => row.event_id);
    return [...new Set(ids)];
  },
};

// ============= Booking Reminder Repository =============
export const BookingReminderRepository = {
  async findByBookingAndType(bookingId: number, reminderType: string) {
    const { data, error } = await supabaseAny
      .from('booking_reminders')
      .select('*')
      .eq('booking_id', bookingId)
      .eq('reminder_type', reminderType)
      .single();
    if (error && error.code !== 'PGRST116') throw error;
    return data;
  },

  async record(params: {
    bookingId: number;
    reminderType: string;
    notificationMethod: string;
    status?: string;
    errorMessage?: string;
  }) {
    const { error } = await supabaseAny
      .from('booking_reminders')
      .upsert(
        {
          booking_id: params.bookingId,
          reminder_type: params.reminderType,
          notification_method: params.notificationMethod,
          status: params.status || 'sent',
          error_message: params.errorMessage || null,
          sent_at: new Date().toISOString(),
        },
        { onConflict: 'booking_id,reminder_type' }
      );
    if (error) throw error;
  },
};

// ============= Product Promotion Repository =============
export interface ProductPromotion {
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
  updated_at: string;
}

export const ProductPromotionRepository = {
  /**
   * Find active promotion for a specific product or all products of a type.
   * Returns the first matching active promo where NOW() is within the date range
   * and redemption limit has not been reached.
   */
  async findActive(productType: string, productId?: number): Promise<ProductPromotion | null> {
    const now = new Date().toISOString();

    // First try product-specific promo
    if (productId) {
      const { data: specific, error: err1 } = await supabaseAny
        .from('product_promotions')
        .select('*')
        .eq('product_type', productType)
        .eq('product_id', productId)
        .eq('is_active', true)
        .lte('starts_at', now)
        .gte('ends_at', now)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (err1) throw err1;
      if (specific && (specific.max_redemptions === null || specific.redemptions < specific.max_redemptions)) {
        return specific as ProductPromotion;
      }
    }

    // Then try type-wide promo (product_id IS NULL)
    const { data: global, error: err2 } = await supabaseAny
      .from('product_promotions')
      .select('*')
      .eq('product_type', productType)
      .is('product_id', null)
      .eq('is_active', true)
      .lte('starts_at', now)
      .gte('ends_at', now)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (err2) throw err2;
    if (global && (global.max_redemptions === null || global.redemptions < global.max_redemptions)) {
      return global as ProductPromotion;
    }

    return null;
  },

  /**
   * Find all active promotions for a product type (for bulk enrichment)
   */
  async findAllActive(productType: string): Promise<ProductPromotion[]> {
    const now = new Date().toISOString();

    const { data, error } = await supabaseAny
      .from('product_promotions')
      .select('*')
      .eq('product_type', productType)
      .eq('is_active', true)
      .lte('starts_at', now)
      .gte('ends_at', now)
      .order('created_at', { ascending: false });

    if (error) throw error;

    return ((data ?? []) as ProductPromotion[]).filter(
      p => p.max_redemptions === null || p.redemptions < p.max_redemptions
    );
  },

  async findAll(): Promise<ProductPromotion[]> {
    const { data, error } = await supabaseAny
      .from('product_promotions')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;
    return (data ?? []) as ProductPromotion[];
  },

  async findById(promotionId: number): Promise<ProductPromotion | null> {
    const { data, error } = await supabaseAny
      .from('product_promotions')
      .select('*')
      .eq('promotion_id', promotionId)
      .single();

    if (error && error.code !== 'PGRST116') throw error;
    return (data as ProductPromotion) ?? null;
  },

  async create(promo: {
    product_type: string;
    product_id?: number | null;
    discount_type: 'percent' | 'fixed_price';
    discount_value: number;
    promo_label?: string;
    promo_note?: string;
    starts_at: string;
    ends_at: string;
    max_redemptions?: number | null;
  }): Promise<ProductPromotion> {
    const { data, error } = await supabaseAny
      .from('product_promotions')
      .insert(promo)
      .select()
      .single();

    if (error) throw error;
    return data as ProductPromotion;
  },

  async update(promotionId: number, updates: Partial<ProductPromotion>): Promise<ProductPromotion> {
    const { data, error } = await supabaseAny
      .from('product_promotions')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('promotion_id', promotionId)
      .select()
      .single();

    if (error) throw error;
    return data as ProductPromotion;
  },

  async incrementRedemptions(promotionId: number): Promise<void> {
    const { error } = await supabase.rpc('increment_product_promotion_redemptions', {
      p_promotion_id: promotionId,
    });
    if (error) {
      // Fallback: optimistic lock increment
      const promo = await this.findById(promotionId);
      if (promo) {
        await supabaseAny
          .from('product_promotions')
          .update({ redemptions: promo.redemptions + 1, updated_at: new Date().toISOString() })
          .eq('promotion_id', promotionId)
          .eq('redemptions', promo.redemptions);
      }
    }
  },
};

// ============= Promo Offer Types =============
export interface PromoOfferPlan {
  name: string;
  normalValue: number;
  regularPrice: number;
  promoPrice: number;
  savingsPercent: number;
  planId?: number;
}

export interface PromoOffer {
  offer_id: number;
  title: string;
  subtitle: string | null;
  promo_label: string | null;
  promo_note: string | null;
  notes: string[];
  plans: PromoOfferPlan[];
  starts_at: string;
  ends_at: string;
  max_redemptions: number | null;
  redemptions: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// ============= Promo Offer Repository =============
export const PromoOfferRepository = {
  async findActive(): Promise<PromoOffer[]> {
    const now = new Date().toISOString();
    const { data, error } = await supabaseAny
      .from('promo_offers')
      .select('*')
      .eq('is_active', true)
      .lte('starts_at', now)
      .gte('ends_at', now)
      .order('created_at', { ascending: false });

    if (error) throw error;

    return ((data ?? []) as PromoOffer[]).filter(
      o => o.max_redemptions === null || o.redemptions < o.max_redemptions
    );
  },

  async findAll(): Promise<PromoOffer[]> {
    const { data, error } = await supabaseAny
      .from('promo_offers')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;
    return (data ?? []) as PromoOffer[];
  },

  async findById(offerId: number): Promise<PromoOffer | null> {
    const { data, error } = await supabaseAny
      .from('promo_offers')
      .select('*')
      .eq('offer_id', offerId)
      .single();

    if (error && error.code !== 'PGRST116') throw error;
    return (data as PromoOffer) ?? null;
  },

  async create(offer: {
    title: string;
    subtitle?: string;
    promo_label?: string;
    promo_note?: string;
    notes?: string[];
    plans: PromoOfferPlan[];
    starts_at: string;
    ends_at: string;
    max_redemptions?: number | null;
  }): Promise<PromoOffer> {
    const { data, error } = await supabaseAny
      .from('promo_offers')
      .insert(offer)
      .select()
      .single();

    if (error) throw error;
    return data as PromoOffer;
  },

  async update(offerId: number, updates: Partial<PromoOffer>): Promise<PromoOffer> {
    const { data, error } = await supabaseAny
      .from('promo_offers')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('offer_id', offerId)
      .select()
      .single();

    if (error) throw error;
    return data as PromoOffer;
  },
};
