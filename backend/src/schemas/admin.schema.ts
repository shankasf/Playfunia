import { z } from 'zod';

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
  })
  .refine(data => Object.keys(data).length > 0, {
    message: 'At least one field must be provided to update a booking.',
  })
  .strip();

export type AdminBookingUpdateInput = z.infer<typeof adminBookingUpdateSchema>;

// ============= User Schemas =============
export const adminUserUpdateSchema = z
  .object({
    email: z.string().email().optional(),
    first_name: z.string().min(1).max(100).optional(),
    last_name: z.string().min(1).max(100).optional(),
    role: z.enum(['user', 'admin', 'staff']).optional(),
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
    full_name: z.string().min(1).max(200).optional(),
    email: z.string().email().optional(),
    phone: z.string().max(20).optional(),
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
    first_name: z.string().min(1).max(100),
    last_name: z.string().min(1).max(100).optional(),
    birth_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    gender: z.enum(['male', 'female', 'other']).optional(),
  })
  .strip();

export type AdminChildCreateInput = z.infer<typeof adminChildCreateSchema>;

export const adminChildUpdateSchema = z
  .object({
    first_name: z.string().min(1).max(100).optional(),
    last_name: z.string().min(1).max(100).optional(),
    birth_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    gender: z.enum(['male', 'female', 'other']).optional(),
  })
  .refine(data => Object.keys(data).length > 0, {
    message: 'At least one field must be provided to update a child.',
  })
  .strip();

export type AdminChildUpdateInput = z.infer<typeof adminChildUpdateSchema>;

// ============= Event Schemas =============
// Media type for event posts (image, video, gif)
const eventMediaTypeSchema = z.enum(['image', 'video', 'gif']).optional();

export const adminEventCreateSchema = z
  .object({
    title: z.string().min(1).max(200),
    description: z.string().max(2000).optional(),
    start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2})?/),
    end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2})?/).optional(),
    location: z.string().max(200).optional(),
    capacity: z.number().int().positive().optional(),
    is_published: z.boolean().optional(),
    // Media support - image/video/gif
    image_url: z.string().url().optional(),
    video_url: z.string().url().optional(),
    media_type: eventMediaTypeSchema,
    tags: z.array(z.string()).optional(),
  })
  .strip();

export type AdminEventCreateInput = z.infer<typeof adminEventCreateSchema>;

export const adminEventUpdateSchema = z
  .object({
    title: z.string().min(1).max(200).optional(),
    description: z.string().max(2000).optional(),
    start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2})?/).optional(),
    end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2})?/).optional(),
    location: z.string().max(200).optional(),
    capacity: z.number().int().positive().optional(),
    is_published: z.boolean().optional(),
    // Media support - image/video/gif
    image_url: z.string().url().optional(),
    video_url: z.string().url().optional(),
    media_type: eventMediaTypeSchema,
    tags: z.array(z.string()).optional(),
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
    guardian_name: z.string().min(1).max(200).optional(),
    guardian_email: z.string().email().optional(),
    guardian_phone: z.string().max(20).optional(),
    emergency_contact_name: z.string().max(200).optional(),
    emergency_contact_phone: z.string().max(20).optional(),
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
