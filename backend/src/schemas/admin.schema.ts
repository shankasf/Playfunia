import { z } from 'zod';

const nameRegex = /^[A-Za-zÀ-ÿ\s'-]+$/;

// Phone: strip non-digits, require exactly 10
const phoneSchema = z
  .string()
  .trim()
  .transform(val => val.replace(/\D/g, ''))
  .refine(val => val.length === 0 || val.length === 10, 'Phone must be empty or exactly 10 digits');

// ============= Booking Schemas =============
export const adminBookingFilterSchema = z
  .object({
    status: z.enum(['Pending', 'Confirmed', 'Cancelled']).optional(),
    location: z.string().min(2).optional(),
    dateFrom: z.coerce.date().optional(),
    dateTo: z.coerce.date().optional(),
    limit: z.coerce.number().int().min(1).max(250).optional(),
  })
  .strip();

export type AdminBookingFilterInput = z.infer<typeof adminBookingFilterSchema>;

export const adminBookingUpdateSchema = z
  .object({
    status: z.enum(['Pending', 'Confirmed', 'Cancelled']).optional(),
    eventDate: z.coerce.date().optional(),
    startTime: z
      .string()
      .regex(/^[0-2]\d:[0-5]\d$/)
      .optional(),
    location: z.string().min(2).optional(),
    notes: z.string().max(500).optional(),
    privateNotes: z.string().max(1000).optional(),
  })
  .refine(data => Object.keys(data).length > 0, {
    message: 'At least one field must be provided to update a booking.',
  })
  .strip();

export type AdminBookingUpdateInput = z.infer<typeof adminBookingUpdateSchema>;

// ============= User Schemas =============
// Valid roles for the application
export const validRoles = ['customer', 'employee', 'admin', 'user', 'staff'] as const;
export type ValidRole = typeof validRoles[number];

export const adminUserUpdateSchema = z
  .object({
    email: z.string().trim().email().toLowerCase().optional(),
    first_name: z.string().trim().min(1).max(100).regex(nameRegex, 'Name must contain only letters, spaces, hyphens, or apostrophes').optional(),
    last_name: z.string().trim().min(1).max(100).regex(nameRegex, 'Name must contain only letters, spaces, hyphens, or apostrophes').optional(),
    phone: phoneSchema.optional(),
    // Single role (legacy support) - gets converted to roles array
    role: z.enum(validRoles).optional(),
    // Multiple roles array
    roles: z.array(z.enum(validRoles)).min(1).optional(),
    is_active: z.boolean().optional(),
  })
  .refine(data => Object.keys(data).length > 0, {
    message: 'At least one field must be provided to update a user.',
  })
  .strip();

export type AdminUserUpdateInput = z.infer<typeof adminUserUpdateSchema>;

// ============= Customer Schemas =============
export const adminCustomerUpdateSchema = z
  .object({
    full_name: z.string().trim().min(1).max(200).regex(nameRegex, 'Name must contain only letters, spaces, hyphens, or apostrophes').optional(),
    email: z.string().trim().email().toLowerCase().optional(),
    phone: phoneSchema.optional(),
  })
  .refine(data => Object.keys(data).length > 0, {
    message: 'At least one field must be provided to update a customer.',
  })
  .strip();

export type AdminCustomerUpdateInput = z.infer<typeof adminCustomerUpdateSchema>;

// ============= Child Schemas =============
export const adminChildCreateSchema = z
  .object({
    customer_id: z.number().int().positive(),
    first_name: z.string().trim().min(1).max(100).regex(nameRegex, 'Name must contain only letters, spaces, hyphens, or apostrophes'),
    last_name: z.string().trim().min(1).max(100).regex(nameRegex, 'Name must contain only letters, spaces, hyphens, or apostrophes').optional(),
    birth_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    gender: z.enum(['male', 'female', 'other']).optional(),
  })
  .strip();

export type AdminChildCreateInput = z.infer<typeof adminChildCreateSchema>;

export const adminChildUpdateSchema = z
  .object({
    first_name: z.string().trim().min(1).max(100).regex(nameRegex, 'Name must contain only letters, spaces, hyphens, or apostrophes').optional(),
    last_name: z.string().trim().min(1).max(100).regex(nameRegex, 'Name must contain only letters, spaces, hyphens, or apostrophes').optional(),
    birth_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format').optional(),
    gender: z.enum(['male', 'female', 'other']).optional(),
  })
  .refine(data => Object.keys(data).length > 0, {
    message: 'At least one field must be provided to update a child.',
  })
  .strip();

export type AdminChildUpdateInput = z.infer<typeof adminChildUpdateSchema>;

// ============= Event Schemas =============
export const adminEventCreateSchema = z
  .object({
    title: z.string().min(1).max(200),
    description: z.string().max(2000).optional(),
    start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2})?/),
    end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2})?/).optional(),
    is_published: z.boolean().optional(),
    image_url: z.string().url().optional(),
  })
  .strip();

export type AdminEventCreateInput = z.infer<typeof adminEventCreateSchema>;

export const adminEventUpdateSchema = z
  .object({
    title: z.string().min(1).max(200).optional(),
    description: z.string().max(2000).optional(),
    start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2})?/).optional(),
    end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2})?/).optional(),
    is_published: z.boolean().optional(),
    image_url: z.string().url().nullable().optional(),
  })
  .refine(data => Object.keys(data).length > 0, {
    message: 'At least one field must be provided to update an event.',
  })
  .strip();

export type AdminEventUpdateInput = z.infer<typeof adminEventUpdateSchema>;

// ============= Membership Plan Schemas =============
export const adminMembershipPlanCreateSchema = z
  .object({
    name: z.string().min(1).max(100),
    tier: z.enum(['explorer', 'adventurer', 'champion']),
    price_cents: z.number().int().nonnegative(),
    billing_cycle: z.enum(['monthly', 'quarterly', 'annually']).optional(),
    description: z.string().max(1000).optional(),
    is_active: z.boolean().optional(),
  })
  .strip();

export type AdminMembershipPlanCreateInput = z.infer<typeof adminMembershipPlanCreateSchema>;

export const adminMembershipPlanUpdateSchema = z
  .object({
    name: z.string().min(1).max(100).optional(),
    tier: z.enum(['explorer', 'adventurer', 'champion']).optional(),
    price_cents: z.number().int().nonnegative().optional(),
    billing_cycle: z.enum(['monthly', 'quarterly', 'annually']).optional(),
    description: z.string().max(1000).optional(),
    is_active: z.boolean().optional(),
  })
  .refine(data => Object.keys(data).length > 0, {
    message: 'At least one field must be provided to update a membership plan.',
  })
  .strip();

export type AdminMembershipPlanUpdateInput = z.infer<typeof adminMembershipPlanUpdateSchema>;

// ============= Waiver Schemas =============
export const adminWaiverListQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(500).optional(),
  })
  .strip();

export type AdminWaiverListQuery = z.infer<typeof adminWaiverListQuerySchema>;

export const adminWaiverUpdateSchema = z
  .object({
    guardian_name: z.string().trim().min(1).max(200).regex(nameRegex, 'Name must contain only letters, spaces, hyphens, or apostrophes').optional(),
    guardian_email: z.string().trim().email().toLowerCase().optional(),
    guardian_phone: phoneSchema.optional(),
    emergency_contact_name: z.string().trim().max(200).regex(nameRegex, 'Name must contain only letters, spaces, hyphens, or apostrophes').optional(),
    emergency_contact_phone: phoneSchema.optional(),
    marketing_opt_in: z.boolean().optional(),
  })
  .refine(data => Object.keys(data).length > 0, {
    message: 'At least one field must be provided to update a waiver.',
  })
  .strip();

export type AdminWaiverUpdateInput = z.infer<typeof adminWaiverUpdateSchema>;

// ============= Other Schemas =============
export const adminExportFormatSchema = z
  .object({
    format: z.enum(['csv']).default('csv'),
  })
  .strip();

export const adminRedeemTicketSchema = z
  .object({
    code: z.string().min(6),
  })
  .strip();

export type AdminRedeemTicketInput = z.infer<typeof adminRedeemTicketSchema>;

export const adminMembershipLookupSchema = z
  .object({
    lookup: z.string().min(2),
  })
  .strip();

export type AdminMembershipLookupInput = z.infer<typeof adminMembershipLookupSchema>;

// ============= Job Application Schemas =============
export const adminJobApplicationStatusUpdateSchema = z
  .object({
    status: z.enum(['new', 'reviewed', 'interview_scheduled', 'offered', 'hired', 'rejected', 'withdrawn']),
    admin_notes: z.string().max(2000).optional(),
  })
  .strip();

export type AdminJobApplicationStatusUpdateInput = z.infer<typeof adminJobApplicationStatusUpdateSchema>;

// Full admin edit of a job application
export const adminJobApplicationUpdateSchema = z
  .object({
    first_name: z.string().trim().min(1).max(100).regex(nameRegex, 'Name must contain only letters, spaces, hyphens, or apostrophes').optional(),
    last_name: z.string().trim().min(1).max(100).regex(nameRegex, 'Name must contain only letters, spaces, hyphens, or apostrophes').optional(),
    email: z.string().trim().email().toLowerCase().max(255).optional(),
    phone: phoneSchema.optional(),
    date_of_birth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
    cover_letter: z.string().trim().max(5000).nullable().optional(),
    schedule_preference: z.string().trim().max(100).nullable().optional(),
    available_start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
    has_experience_with_children: z.boolean().optional(),
    gender: z.string().trim().max(50).nullable().optional(),
    pronouns: z.string().trim().max(50).nullable().optional(),
    how_heard: z.string().trim().max(200).nullable().optional(),
    emergency_contact_name: z.string().trim().max(200).regex(nameRegex, 'Name must contain only letters, spaces, hyphens, or apostrophes').nullable().optional(),
    emergency_contact_phone: phoneSchema.nullable().optional(),
    status: z.enum(['new', 'reviewed', 'interview_scheduled', 'offered', 'hired', 'rejected', 'withdrawn']).optional(),
    admin_notes: z.string().max(2000).nullable().optional(),
    listing_id: z.number().int().positive().optional(),
  })
  .refine(data => Object.keys(data).length > 0, {
    message: 'At least one field must be provided to update a job application.',
  })
  .strip();

export type AdminJobApplicationUpdateInput = z.infer<typeof adminJobApplicationUpdateSchema>;

// ============= Job Listing Schemas =============
const employmentTypeEnum = z.enum(['full-time', 'part-time', 'seasonal', 'internship']);
const slugRegex = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const adminJobListingCreateSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    slug: z.string().trim().min(1).max(200).regex(slugRegex, 'Slug must be lowercase letters, numbers, and hyphens'),
    department: z.string().trim().min(1).max(100),
    employment_type: employmentTypeEnum,
    location: z.string().trim().min(1).max(200).optional(),
    description: z.string().trim().min(1),
    responsibilities: z.array(z.string().trim().min(1).max(500)).optional(),
    qualifications: z.array(z.string().trim().min(1).max(500)).optional(),
    nice_to_have: z.array(z.string().trim().min(1).max(500)).optional(),
    perks: z.array(z.string().trim().min(1).max(500)).optional(),
    pay_range: z.string().trim().max(100).nullable().optional(),
    minimum_age: z.number().int().min(14).max(99).optional(),
    schedule_notes: z.string().trim().max(200).nullable().optional(),
    display_order: z.number().int().min(0).optional(),
    is_active: z.boolean().optional(),
    closes_at: z.string().datetime().nullable().optional(),
  })
  .strip();

export type AdminJobListingCreateInput = z.infer<typeof adminJobListingCreateSchema>;

export const adminJobListingUpdateSchema = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    slug: z.string().trim().min(1).max(200).regex(slugRegex, 'Slug must be lowercase letters, numbers, and hyphens').optional(),
    department: z.string().trim().min(1).max(100).optional(),
    employment_type: employmentTypeEnum.optional(),
    location: z.string().trim().min(1).max(200).optional(),
    description: z.string().trim().min(1).optional(),
    responsibilities: z.array(z.string().trim().min(1).max(500)).optional(),
    qualifications: z.array(z.string().trim().min(1).max(500)).optional(),
    nice_to_have: z.array(z.string().trim().min(1).max(500)).optional(),
    perks: z.array(z.string().trim().min(1).max(500)).optional(),
    pay_range: z.string().trim().max(100).nullable().optional(),
    minimum_age: z.number().int().min(14).max(99).optional(),
    schedule_notes: z.string().trim().max(200).nullable().optional(),
    display_order: z.number().int().min(0).optional(),
    is_active: z.boolean().optional(),
    closes_at: z.string().datetime().nullable().optional(),
  })
  .refine(data => Object.keys(data).length > 0, {
    message: 'At least one field must be provided to update a job listing.',
  })
  .strip();

export type AdminJobListingUpdateInput = z.infer<typeof adminJobListingUpdateSchema>;
