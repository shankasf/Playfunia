/**
 * Supabase repositories for database operations
 * These replace the Mongoose models with Supabase client calls
 */

import { supabase, supabaseAny } from '../config/supabase';
import type {
  User,
  Customer,
  Child,
  Membership,
  PartyPackage,
  PartyBooking,
  Waiver,
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
  PartyPackage,
  PartyBooking,
  Waiver,
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

  async create(userData: {
    email: string;
    password_hash: string;
    first_name?: string;
    last_name?: string;
    phone?: string;
    roles?: string[];
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
    stripe_subscription_id?: string;
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
    additional_kids?: number;
    additional_guests?: number;
    special_requests?: string;
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

  async findAll(options?: { status?: string; limit?: number }) {
    let query = supabase
      .from('party_bookings')
      .select('*, party_packages(*), customers(*)');
    if (options?.status) query = query.eq('status', options.status);
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
export const WaiverRepository = {
  async findByCustomerId(customerId: number) {
    const { data, error } = await supabase
      .from('waiver_submissions')
      .select('*')
      .eq('customer_id', customerId)
      .order('signed_at', { ascending: false });
    if (error) throw error;
    return data ?? [];
  },

  async findByWaiverUserId(waiverUserId: number) {
    const { data, error } = await supabase
      .from('waiver_submissions')
      .select('*')
      .eq('waiver_user_id', waiverUserId)
      .order('signed_at', { ascending: false });
    if (error) throw error;
    return data ?? [];
  },

  async findValidByEmail(email: string) {
    const { data, error } = await supabase
      .from('waiver_submissions')
      .select('*')
      .eq('guardian_email', email.toLowerCase())
      .gte('archive_until', new Date().toISOString())
      .order('signed_at', { ascending: false })
      .limit(1)
      .single();
    if (error && error.code !== 'PGRST116') throw error;
    return data;
  },

  async findByEmail(email: string) {
    const { data, error } = await supabase
      .from('waiver_submissions')
      .select('*')
      .eq('guardian_email', email.toLowerCase())
      .order('signed_at', { ascending: false });
    if (error) throw error;
    return data ?? [];
  },

  async findByGuardianEmail(email: string) {
    const { data, error } = await supabase
      .from('waiver_submissions')
      .select('*')
      .eq('guardian_email', email.toLowerCase())
      .order('signed_at', { ascending: false });
    if (error) throw error;
    return data ?? [];
  },

  async findByGuardianPhone(phone: string) {
    const { data, error } = await supabase
      .from('waiver_submissions')
      .select('*')
      .eq('guardian_phone', phone)
      .order('signed_at', { ascending: false });
    if (error) throw error;
    return data ?? [];
  },

  async create(waiverData: {
    customer_id?: number;
    waiver_user_id?: number;
    guardian_name: string;
    guardian_email?: string;
    guardian_phone?: string;
    guardian_date_of_birth?: string;
    relationship_to_children?: string;
    allergies?: string;
    medical_notes?: string;
    insurance_provider?: string;
    insurance_policy_number?: string;
    children: unknown;
    signature: string;
    accepted_policies: string[];
    marketing_opt_in?: boolean;
    archive_until?: string;
    ip_address?: string;
  }) {
    const { data, error } = await supabase
      .from('waiver_submissions')
      .insert({
        ...waiverData,
        children: waiverData.children as Record<string, unknown>,
      })
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async findAll(options?: { limit?: number }) {
    let query = supabaseAny.from('waiver_submissions').select('*');
    if (options?.limit) query = query.limit(options.limit);
    const { data, error } = await query.order('signed_at', { ascending: false });
    if (error) throw error;
    return data ?? [];
  },
};

// ============= Waiver User Repository =============
export const WaiverUserRepository = {
  async findByEmail(email: string) {
    const { data, error } = await supabase
      .from('waiver_users')
      .select('*, waiver_user_children(*)')
      .eq('email', email.toLowerCase())
      .single();
    if (error && error.code !== 'PGRST116') throw error;
    return data;
  },

  async findByPhone(phone: string) {
    const { data, error } = await supabase
      .from('waiver_users')
      .select('*, waiver_user_children(*)')
      .eq('phone', phone)
      .single();
    if (error && error.code !== 'PGRST116') throw error;
    return data;
  },

  async findById(waiverUserId: number) {
    const { data, error } = await supabase
      .from('waiver_users')
      .select('*, waiver_user_children(*)')
      .eq('waiver_user_id', waiverUserId)
      .single();
    if (error && error.code !== 'PGRST116') throw error;
    return data;
  },

  async create(userData: {
    email?: string;
    phone?: string;
    guardian_name?: string;
    marketing_opt_in?: boolean;
  }) {
    const { data, error } = await supabase
      .from('waiver_users')
      .insert({
        email: userData.email?.toLowerCase(),
        phone: userData.phone,
        guardian_name: userData.guardian_name,
        marketing_opt_in: userData.marketing_opt_in ?? false,
      })
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async update(waiverUserId: number, updates: Partial<WaiverUser>) {
    const { data, error } = await supabase
      .from('waiver_users')
      .update(updates)
      .eq('waiver_user_id', waiverUserId)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async updateChildren(waiverUserId: number, children: Array<{ name: string; birth_date: string; gender?: string }>) {
    // Delete existing children
    await supabaseAny.from('waiver_user_children').delete().eq('waiver_user_id', waiverUserId);
    
    // Insert new children
    if (children.length > 0) {
      const { error } = await supabaseAny.from('waiver_user_children').insert(
        children.map((c) => ({ ...c, waiver_user_id: waiverUserId }))
      );
      if (error) throw error;
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

  async findByStripePaymentIntentId(paymentIntentId: string) {
    const { data, error } = await supabase
      .from('payments')
      .select('*')
      .eq('provider', 'stripe')
      .eq('provider_payment_id', paymentIntentId)
      .single();
    if (error && error.code !== 'PGRST116') throw error;
    return data;
  },

  async create(paymentData: {
    order_id: number;
    provider?: string;
    provider_payment_id?: string;
    stripe_payment_intent_id?: string; // Alias for provider_payment_id
    status?: string;
    amount_usd: number;
  }) {
    const { data, error } = await supabase
      .from('payments')
      .insert({
        order_id: paymentData.order_id,
        provider: paymentData.provider ?? 'stripe',
        provider_payment_id: paymentData.stripe_payment_intent_id ?? paymentData.provider_payment_id,
        status: paymentData.status ?? 'Pending',
        amount_usd: paymentData.amount_usd,
      })
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
    let query = supabaseAny.from('promotions').select('*');
    if (activeOnly) query = query.eq('is_active', true);
    const { data, error } = await query;
    if (error) throw error;
    return data ?? [];
  },

  async incrementRedemptions(promotionId: number) {
    const { data, error } = await supabase.rpc('increment_promotion_redemptions', {
      p_promotion_id: promotionId,
    });
    if (error) {
      // Fallback if RPC doesn't exist
      const promo = await this.findById(promotionId);
      if (promo) {
        await supabase
          .from('promotions')
          .update({ redemptions: (promo.redemptions ?? 0) + 1 })
          .eq('promotion_id', promotionId);
      }
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
    const { data, error } = await supabase
      .from('locations')
      .select('*')
      .ilike('name', `%${name}%`)
      .eq('is_active', true)
      .single();
    if (error && error.code !== 'PGRST116') throw error;
    return data;
  },
};

// ============= Event Repository =============
export const EventRepository = {
  async findAll(options?: { publishedOnly?: boolean | undefined; limit?: number | undefined }) {
    let query = supabaseAny.from('events').select('*, locations(*)');
    if (options?.publishedOnly) query = query.eq('is_published', true);
    if (options?.limit) query = query.limit(options.limit);
    const { data, error } = await query.order('start_date', { ascending: true });
    if (error) throw error;
    return data ?? [];
  },

  async findById(eventId: number) {
    const { data, error } = await supabase
      .from('events')
      .select('*, locations(*)')
      .eq('event_id', eventId)
      .single();
    if (error && error.code !== 'PGRST116') throw error;
    return data;
  },

  async findUpcoming(limit?: number) {
    const now = new Date().toISOString();
    let query = supabase
      .from('events')
      .select('*, locations(*)')
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
    location_id?: number;
    capacity?: number;
    tickets_remaining?: number;
    price?: number;
    tags?: string[];
    image_url?: string;
    is_published?: boolean;
  }) {
    const { data, error } = await supabase
      .from('events')
      .insert({
        ...eventData,
        tickets_remaining: eventData.tickets_remaining ?? eventData.capacity,
      })
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

  async decrementTickets(eventId: number, quantity: number) {
    const event = await this.findById(eventId);
    if (!event) throw new Error('Event not found');
    
    const newRemaining = Math.max(0, (event.tickets_remaining ?? 0) - quantity);
    return this.update(eventId, { tickets_remaining: newRemaining });
  },
};

// ============= Membership Plan Repository =============
export const MembershipPlanRepository = {
  async findAll(activeOnly = true) {
    let query = supabaseAny.from('membership_plans').select('*');
    if (activeOnly) query = query.eq('is_active', true);
    const { data, error } = await query.order('monthly_price', { ascending: true });
    if (error) throw error;
    return data ?? [];
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
    // Search for a purchase containing this code in the codes array
    const { data, error } = await supabase
      .from('ticket_purchases')
      .select('*, events(*), ticket_types(*), customers(*)')
      .contains('codes', [{ code }])
      .single();
    if (error && error.code !== 'PGRST116') throw error;
    return data;
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
    stripe_payment_intent_id?: string;
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
    
    const codes = (purchase.codes ?? []).map((c: { code: string; status: string; redeemedAt?: string }) =>
      c.code === code ? { ...c, status: 'redeemed', redeemedAt: new Date().toISOString() } : c
    );
    
    return this.update(purchaseId, { codes });
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

  async findByStripePaymentIntentId(paymentIntentId: string) {
    const { data, error } = await supabase
      .from('app_payments')
      .select('*, customers(*)')
      .eq('stripe_payment_intent_id', paymentIntentId)
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
    stripe_payment_intent_id: string;
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

  async updateByStripeId(stripePaymentIntentId: string, updates: Partial<AppPayment>) {
    const { data, error } = await supabase
      .from('app_payments')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('stripe_payment_intent_id', stripePaymentIntentId)
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
    return data;
  },

  async findByCustomerId(customerId: number) {
    const { data, error } = await supabase
      .from('waiver_submissions')
      .select('*')
      .eq('customer_id', customerId)
      .order('signed_at', { ascending: false });
    if (error) throw error;
    return data ?? [];
  },

  async findByWaiverUserId(waiverUserId: number) {
    const { data, error } = await supabase
      .from('waiver_submissions')
      .select('*')
      .eq('waiver_user_id', waiverUserId)
      .order('signed_at', { ascending: false });
    if (error) throw error;
    return data ?? [];
  },

  async findValidByEmail(email: string) {
    const now = new Date().toISOString();
    const { data, error } = await supabase
      .from('waiver_submissions')
      .select('*')
      .eq('guardian_email', email.toLowerCase())
      .or(`expires_at.is.null,expires_at.gte.${now}`)
      .order('signed_at', { ascending: false })
      .limit(1)
      .single();
    if (error && error.code !== 'PGRST116') throw error;
    return data;
  },

  async create(waiverData: {
    customer_id?: number;
    waiver_user_id?: number;
    guardian_name: string;
    guardian_email?: string;
    guardian_phone?: string;
    guardian_date_of_birth?: string;
    relationship_to_children?: string;
    allergies?: string;
    medical_notes?: string;
    insurance_provider?: string;
    insurance_policy_number?: string;
    children: { name: string; birthDate: string; gender?: string }[];
    child_ids?: number[];
    signature: string;
    accepted_policies: string[];
    marketing_opt_in?: boolean;
    expires_at?: string;
    archive_until?: string;
    ip_address?: string;
  }) {
    const { data, error } = await supabase
      .from('waiver_submissions')
      .insert({
        ...waiverData,
        guardian_email: waiverData.guardian_email?.toLowerCase(),
      })
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async findAll(options?: { limit?: number | undefined }) {
    let query = supabaseAny.from('waiver_submissions').select('*, customers(*), waiver_users(*)');
    if (options?.limit) query = query.limit(options.limit);
    const { data, error } = await query.order('signed_at', { ascending: false });
    if (error) throw error;
    return data ?? [];
  },

  async update(
    submissionId: number,
    updates: Partial<{
      guardian_name: string | null;
      guardian_email: string | null;
      guardian_phone: string | null;
      guardian_date_of_birth: string | null;
      relationship_to_children: string | null;
      allergies: string | null;
      medical_notes: string | null;
      insurance_provider: string | null;
      insurance_policy_number: string | null;
      children: unknown;
      marketing_opt_in: boolean | null;
      expires_at: string | null;
      signed_at: string | null;
      archive_until: string | null;
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
    return data;
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
