import type { Request, Response } from 'express';
import { DateTime } from 'luxon';

import * as AdminService from '../services/admin.service';
import { recordMembershipVisitByMembershipId } from '../services/membership.service';
import { AppError } from '../utils/app-error';
import { asyncHandler } from '../utils/async-handler';
import {
  getRecentAdminEvents,
  publishAdminEvent,
  subscribeAdminEvents,
  type AdminEvent,
} from '../services/admin-events.service';
import {
  adminUserUpdateSchema,
  adminCustomerUpdateSchema,
  adminChildCreateSchema,
  adminChildUpdateSchema,
  adminEventCreateSchema,
  adminEventUpdateSchema,
  adminMembershipPlanCreateSchema,
  adminMembershipPlanUpdateSchema,
  adminWaiverUpdateSchema,
} from '../schemas/admin.schema';

// ============= Helper Functions =============
function parseIntParam(value: string | undefined): number {
  const parsed = parseInt(value || '', 10);
  if (isNaN(parsed)) throw new AppError('Invalid ID parameter', 400);
  return parsed;
}

function buildCsv(rows: Array<Array<string | number | undefined>>) {
  const escape = (raw: string) => {
    if (raw.includes(',') || raw.includes('\n') || raw.includes('"')) {
      return `"${raw.replace(/"/g, '""')}"`;
    }
    return raw;
  };

  return rows
    .map(row =>
      row
        .map(value => {
          const normalized = value === undefined ? '' : String(value);
          return escape(normalized);
        })
        .join(','),
    )
    .join('\n');
}

// ============= Dashboard =============
export const getAdminSummaryHandler = asyncHandler(async (_req, res) => {
  const summary = await AdminService.getAdminDashboardSummary();
  return res.status(200).json(summary);
});

// ============= Users CRUD =============
export const listUsersHandler = asyncHandler(async (req, res) => {
  const limit = parseInt(req.query.limit as string) || 50;
  const offset = parseInt(req.query.offset as string) || 0;
  const search = req.query.search as string | undefined;
  
  const result = await AdminService.listUsers({ limit, offset, search });
  return res.status(200).json(result);
});

export const getUserHandler = asyncHandler(async (req, res) => {
  const userId = parseIntParam(req.params.id);
  const user = await AdminService.getUserById(userId);
  if (!user) throw new AppError('User not found', 404);
  return res.status(200).json({ user });
});

export const updateUserHandler = asyncHandler(async (req, res) => {
  const userId = parseIntParam(req.params.id);
  const validated = adminUserUpdateSchema.parse(req.body);
  const user = await AdminService.updateUser(userId, validated);
  publishAdminEvent('user.updated', { userId });
  return res.status(200).json({ user });
});

export const deleteUserHandler = asyncHandler(async (req, res) => {
  const userId = parseIntParam(req.params.id);
  await AdminService.deleteUser(userId);
  publishAdminEvent('user.deleted', { userId });
  return res.status(200).json({ success: true });
});

// ============= Customers CRUD =============
export const listCustomersHandler = asyncHandler(async (req, res) => {
  const limit = parseInt(req.query.limit as string) || 50;
  const offset = parseInt(req.query.offset as string) || 0;
  const search = req.query.search as string | undefined;
  
  const customers = await AdminService.listCustomers({ limit, offset, search });
  return res.status(200).json({ customers });
});

export const getCustomerHandler = asyncHandler(async (req, res) => {
  const customerId = parseIntParam(req.params.id);
  const customer = await AdminService.getCustomerById(customerId);
  if (!customer) throw new AppError('Customer not found', 404);
  return res.status(200).json({ customer });
});

export const updateCustomerHandler = asyncHandler(async (req, res) => {
  const customerId = parseIntParam(req.params.id);
  const validated = adminCustomerUpdateSchema.parse(req.body);
  const customer = await AdminService.updateCustomer(customerId, validated);
  return res.status(200).json({ customer });
});

export const deleteCustomerHandler = asyncHandler(async (req, res) => {
  const customerId = parseIntParam(req.params.id);
  await AdminService.deleteCustomer(customerId);
  return res.status(200).json({ success: true });
});

// ============= Children CRUD =============
export const listChildrenHandler = asyncHandler(async (req, res) => {
  const customerId = req.query.customerId ? parseInt(req.query.customerId as string) : undefined;
  const limit = parseInt(req.query.limit as string) || 100;
  
  const children = await AdminService.listChildren({ customerId, limit });
  return res.status(200).json({ children });
});

export const getChildHandler = asyncHandler(async (req, res) => {
  const childId = parseIntParam(req.params.id);
  const child = await AdminService.getChildById(childId);
  if (!child) throw new AppError('Child not found', 404);
  return res.status(200).json({ child });
});

export const createChildHandler = asyncHandler(async (req, res) => {
  const validated = adminChildCreateSchema.parse(req.body);
  const child = await AdminService.createChild(validated);
  return res.status(201).json({ child });
});

export const updateChildHandler = asyncHandler(async (req, res) => {
  const childId = parseIntParam(req.params.id);
  const validated = adminChildUpdateSchema.parse(req.body);
  const child = await AdminService.updateChild(childId, validated);
  return res.status(200).json({ child });
});

export const deleteChildHandler = asyncHandler(async (req, res) => {
  const childId = parseIntParam(req.params.id);
  await AdminService.deleteChild(childId);
  return res.status(200).json({ success: true });
});

// ============= Events CRUD =============
export const listEventsHandler = asyncHandler(async (req, res) => {
  const publishedOnly = req.query.publishedOnly === 'true';
  const limit = parseInt(req.query.limit as string) || 50;
  
  const events = await AdminService.listEvents({ publishedOnly, limit });
  return res.status(200).json({ events });
});

export const getEventHandler = asyncHandler(async (req, res) => {
  const eventId = parseIntParam(req.params.id);
  const event = await AdminService.getEventById(eventId);
  if (!event) throw new AppError('Event not found', 404);
  return res.status(200).json({ event });
});

export const createEventHandler = asyncHandler(async (req, res) => {
  const validated = adminEventCreateSchema.parse(req.body);
  const event = await AdminService.createEvent(validated) as { event_id: number };
  publishAdminEvent('event.created', { eventId: event.event_id });
  return res.status(201).json({ event });
});

export const updateEventHandler = asyncHandler(async (req, res) => {
  const eventId = parseIntParam(req.params.id);
  const validated = adminEventUpdateSchema.parse(req.body);
  const event = await AdminService.updateEvent(eventId, validated);
  publishAdminEvent('event.updated', { eventId });
  return res.status(200).json({ event });
});

export const deleteEventHandler = asyncHandler(async (req, res) => {
  const eventId = parseIntParam(req.params.id);
  await AdminService.deleteEvent(eventId);
  publishAdminEvent('event.deleted', { eventId });
  return res.status(200).json({ success: true });
});

// ============= Membership Plans CRUD =============
export const listMembershipPlansHandler = asyncHandler(async (req, res) => {
  const activeOnly = req.query.activeOnly === 'true';
  const plans = await AdminService.listMembershipPlans(activeOnly);
  return res.status(200).json({ plans });
});

export const getMembershipPlanHandler = asyncHandler(async (req, res) => {
  const planId = parseIntParam(req.params.id);
  const plan = await AdminService.getMembershipPlanById(planId);
  if (!plan) throw new AppError('Membership plan not found', 404);
  return res.status(200).json({ plan });
});

export const createMembershipPlanHandler = asyncHandler(async (req, res) => {
  const validated = adminMembershipPlanCreateSchema.parse(req.body);
  const plan = await AdminService.createMembershipPlan(validated);
  return res.status(201).json({ plan });
});

export const updateMembershipPlanHandler = asyncHandler(async (req, res) => {
  const planId = parseIntParam(req.params.id);
  const validated = adminMembershipPlanUpdateSchema.parse(req.body);
  const plan = await AdminService.updateMembershipPlan(planId, validated);
  return res.status(200).json({ plan });
});

export const deleteMembershipPlanHandler = asyncHandler(async (req, res) => {
  const planId = parseIntParam(req.params.id);
  await AdminService.deleteMembershipPlan(planId);
  return res.status(200).json({ success: true });
});

// ============= Customer Memberships CRUD =============

// Define membership tier info for transformation
const MEMBERSHIP_TIERS: Record<string, { name: string; discountPercent: number; guestPassesPerMonth: number; visitsPerMonth: number | null }> = {
  explorer: { name: 'Silver', discountPercent: 5, guestPassesPerMonth: 1, visitsPerMonth: 8 },
  adventurer: { name: 'Gold', discountPercent: 10, guestPassesPerMonth: 2, visitsPerMonth: 12 },
  champion: { name: 'Platinum', discountPercent: 15, guestPassesPerMonth: 3, visitsPerMonth: 16 },
};

// Transform DB membership to frontend format
function transformMembership(m: Record<string, unknown>): Record<string, unknown> {
  const customer = m.customers as Record<string, unknown> | null;
  const tier = (m.tier as string) ?? 'explorer';
  const tierInfo = MEMBERSHIP_TIERS[tier] ?? MEMBERSHIP_TIERS.explorer!;
  
  const visitsPerMonth = (m.visits_per_month as number | null) ?? tierInfo!.visitsPerMonth;
  const visitsUsed = (m.visits_used_this_period as number) ?? 0;
  const visitsRemaining = visitsPerMonth !== null ? visitsPerMonth - visitsUsed : null;
  
  // Try to get user info from customer
  const fullName = customer?.full_name?.toString() ?? '';
  const nameParts = fullName.split(' ');
  
  return {
    userId: String(m.customer_id ?? ''),
    firstName: nameParts[0] ?? '',
    lastName: nameParts.slice(1).join(' ') ?? '',
    email: customer?.email ?? '',
    membership: {
      membershipId: String(m.membership_id),
      tierName: tierInfo!.name,
      autoRenew: m.auto_renew ?? true,
      visitsPerMonth,
      visitsUsed,
      visitsRemaining,
      visitPeriodStart: m.visit_period_start?.toString() ?? null,
      lastVisitAt: m.last_visit_at?.toString() ?? null,
      discountPercent: tierInfo!.discountPercent,
      guestPassesPerMonth: tierInfo!.guestPassesPerMonth,
    },
  };
}

export const listMembershipsHandler = asyncHandler(async (req, res) => {
  const status = req.query.status as string | undefined;
  const limit = parseInt(req.query.limit as string) || 100;
  
  const rawMemberships = await AdminService.listMemberships({ status, limit });
  const memberships = rawMemberships.map((m: Record<string, unknown>) => transformMembership(m));
  return res.status(200).json({ memberships });
});

export const getMembershipHandler = asyncHandler(async (req, res) => {
  const membershipId = parseIntParam(req.params.id);
  const membership = await AdminService.getMembershipById(membershipId);
  if (!membership) throw new AppError('Membership not found', 404);
  return res.status(200).json({ membership });
});

export const createMembershipHandler = asyncHandler(async (req, res) => {
  const membership = await AdminService.createMembership(req.body);
  return res.status(201).json({ membership });
});

export const updateMembershipHandler = asyncHandler(async (req, res) => {
  const membershipId = parseIntParam(req.params.id);
  const membership = await AdminService.updateMembership(membershipId, req.body);
  return res.status(200).json({ membership });
});

export const deleteMembershipHandler = asyncHandler(async (req, res) => {
  const membershipId = parseIntParam(req.params.id);
  await AdminService.deleteMembership(membershipId);
  return res.status(200).json({ success: true });
});

export const validateMembershipHandler = asyncHandler(async (req, res) => {
  const { lookup } = req.body;
  if (!lookup || typeof lookup !== 'string') {
    throw new AppError('Lookup value is required', 400);
  }
  
  // Try to find membership by email, phone, or user ID
  const result = await AdminService.validateMembershipEntry(lookup.trim());
  return res.status(200).json(result);
});

export const recordMembershipVisitHandler = asyncHandler(async (req, res) => {
  const membershipId = parseIntParam(req.params.membershipId);
  const result = await recordMembershipVisitByMembershipId(membershipId);
  return res.status(200).json(result);
});

// ============= Party Packages CRUD =============
export const listPartyPackagesHandler = asyncHandler(async (req, res) => {
  const activeOnly = req.query.activeOnly === 'true';
  const packages = await AdminService.listPartyPackages(activeOnly);
  return res.status(200).json({ packages });
});

export const getPartyPackageHandler = asyncHandler(async (req, res) => {
  const packageId = parseIntParam(req.params.id);
  const partyPackage = await AdminService.getPartyPackageById(packageId);
  if (!partyPackage) throw new AppError('Party package not found', 404);
  return res.status(200).json({ package: partyPackage });
});

export const createPartyPackageHandler = asyncHandler(async (req, res) => {
  const partyPackage = await AdminService.createPartyPackage(req.body);
  return res.status(201).json({ package: partyPackage });
});

export const updatePartyPackageHandler = asyncHandler(async (req, res) => {
  const packageId = parseIntParam(req.params.id);
  const partyPackage = await AdminService.updatePartyPackage(packageId, req.body);
  return res.status(200).json({ package: partyPackage });
});

export const deletePartyPackageHandler = asyncHandler(async (req, res) => {
  const packageId = parseIntParam(req.params.id);
  await AdminService.deletePartyPackage(packageId);
  return res.status(200).json({ success: true });
});

// ============= Party Bookings CRUD =============

// Transform DB booking to frontend format
function transformBooking(b: Record<string, unknown>): Record<string, unknown> {
  const customer = b.customers as Record<string, unknown> | null;
  const pkg = b.party_packages as Record<string, unknown> | null;
  
  // Parse scheduled_start for date and time
  let eventDate = '';
  let startTime = '';
  let endTime = '';
  
  if (b.scheduled_start) {
    const start = new Date(b.scheduled_start as string);
    eventDate = start.toISOString().split('T')[0] ?? '';
    startTime = start.toTimeString().slice(0, 5) ?? '';
  }
  
  if (b.scheduled_end) {
    const end = new Date(b.scheduled_end as string);
    endTime = end.toTimeString().slice(0, 5) ?? '';
  }

  // Calculate balance remaining
  const totalAmount = Number(b.total_amount) || 0;
  const depositPaid = Number(b.deposit_paid) || 0;
  const balanceRemaining = totalAmount - depositPaid;

  return {
    id: String(b.booking_id),
    reference: b.reference?.toString() ?? '',
    location: b.location_name?.toString() ?? '',
    eventDate,
    startTime,
    endTime,
    status: b.status ?? 'Pending',
    paymentStatus: b.payment_status ?? 'awaiting_deposit',
    depositAmount: depositPaid,
    balanceRemaining,
    notes: b.notes ?? null,
    guardian: customer ? {
      firstName: customer.full_name?.toString().split(' ')[0] ?? '',
      lastName: customer.full_name?.toString().split(' ').slice(1).join(' ') ?? '',
      email: customer.email ?? '',
      phone: customer.phone ?? '',
    } : null,
    partyPackage: pkg ? { 
      id: String(pkg.package_id), 
      name: pkg.name?.toString() ?? '' 
    } : null,
  };
}

export const listBookingsHandler = asyncHandler(async (req, res) => {
  const status = req.query.status as string | undefined;
  const dateFrom = req.query.dateFrom as string | undefined;
  const dateTo = req.query.dateTo as string | undefined;
  const limit = parseInt(req.query.limit as string) || 150;
  
  const rawBookings = await AdminService.listBookings({ status, dateFrom, dateTo, limit });
  const bookings = rawBookings.map((b: Record<string, unknown>) => transformBooking(b));
  return res.status(200).json({ bookings });
});

export const getBookingHandler = asyncHandler(async (req, res) => {
  const bookingId = parseIntParam(req.params.id);
  const rawBooking = await AdminService.getBookingById(bookingId);
  if (!rawBooking) throw new AppError('Booking not found', 404);
  const booking = transformBooking(rawBooking as unknown as Record<string, unknown>);
  return res.status(200).json({ booking });
});

export const updateBookingHandler = asyncHandler(async (req, res) => {
  const bookingId = parseIntParam(req.params.id);
  
  // Transform frontend field names to database field names
  const { status, eventDate, startTime, location, notes } = req.body as {
    status?: string;
    eventDate?: string;
    startTime?: string;
    location?: string;
    notes?: string;
  };
  
  const dbUpdates: Record<string, unknown> = {};
  
  if (status !== undefined) dbUpdates.status = status;
  if (notes !== undefined) dbUpdates.notes = notes;
  if (location !== undefined) dbUpdates.location_name = location;
  
  // If eventDate or startTime changed, recalculate scheduled_start/scheduled_end
  if (eventDate !== undefined || startTime !== undefined) {
    // Get existing booking to merge with updates
    const existingBooking = await AdminService.getBookingById(bookingId);
    if (!existingBooking) throw new AppError('Booking not found', 404);
    
    const existingStart = existingBooking.scheduled_start ? new Date(existingBooking.scheduled_start) : null;
    const existingEnd = existingBooking.scheduled_end ? new Date(existingBooking.scheduled_end) : null;
    
    // Calculate duration from existing booking (default 2 hours)
    let durationMs = 2 * 60 * 60 * 1000;
    if (existingStart && existingEnd) {
      durationMs = existingEnd.getTime() - existingStart.getTime();
    }
    
    // Build new scheduled_start
    const newDate = eventDate ?? (existingStart?.toISOString().split('T')[0] ?? '');
    const newTime = startTime ?? (existingStart?.toTimeString().slice(0, 5) ?? '10:00');
    
    if (newDate && newTime) {
      const newStart = new Date(`${newDate}T${newTime}:00`);
      const newEnd = new Date(newStart.getTime() + durationMs);
      
      dbUpdates.scheduled_start = newStart.toISOString();
      dbUpdates.scheduled_end = newEnd.toISOString();
      dbUpdates.event_date = newDate;
      dbUpdates.start_time = newTime;
    }
  }
  
  const updatedBooking = await AdminService.updateBooking(bookingId, dbUpdates as Record<string, unknown>);
  publishAdminEvent('booking.updated', { bookingId, status: (updatedBooking as { status?: string }).status });
  
  // Transform for response
  const booking = transformBooking(updatedBooking as unknown as Record<string, unknown>);
  return res.status(200).json({ booking });
});

export const cancelBookingHandler = asyncHandler(async (req, res) => {
  const bookingId = parseIntParam(req.params.id);
  const booking = await AdminService.cancelBooking(bookingId);
  publishAdminEvent('booking.cancelled', { bookingId });
  return res.status(200).json({ booking });
});

// ============= Waiver Users CRUD =============
export const listWaiverUsersHandler = asyncHandler(async (req, res) => {
  const limit = parseInt(req.query.limit as string) || 100;
  const search = req.query.search as string | undefined;
  
  const waiverUsers = await AdminService.listWaiverUsers({ limit, search });
  return res.status(200).json({ waiverUsers });
});

export const getWaiverUserHandler = asyncHandler(async (req, res) => {
  const waiverUserId = parseIntParam(req.params.id);
  const waiverUser = await AdminService.getWaiverUserById(waiverUserId);
  if (!waiverUser) throw new AppError('Waiver user not found', 404);
  return res.status(200).json({ waiverUser });
});

export const updateWaiverUserHandler = asyncHandler(async (req, res) => {
  const waiverUserId = parseIntParam(req.params.id);
  const waiverUser = await AdminService.updateWaiverUser(waiverUserId, req.body);
  return res.status(200).json({ waiverUser });
});

export const deleteWaiverUserHandler = asyncHandler(async (req, res) => {
  const waiverUserId = parseIntParam(req.params.id);
  await AdminService.deleteWaiverUser(waiverUserId);
  return res.status(200).json({ success: true });
});

// ============= Waiver Submissions =============

// Transform DB waiver to frontend format
function transformWaiver(w: Record<string, unknown>): Record<string, unknown> {
  return {
    id: String(w.submission_id),
    guardianName: w.guardian_name ?? '',
    guardianEmail: w.guardian_email ?? '',
    guardianPhone: w.guardian_phone ?? '',
    guardianDateOfBirth: w.guardian_date_of_birth,
    relationshipToChildren: w.relationship_to_children,
    guardian: w.customers ?? w.waiver_users ?? null,
    children: Array.isArray(w.children) ? w.children : [],
    allergies: w.allergies,
    medicalNotes: w.medical_notes,
    insuranceProvider: w.insurance_provider,
    insurancePolicyNumber: w.insurance_policy_number,
    signedAt: w.signed_at ?? w.created_at,
    expiresAt: w.expires_at,
    marketingOptIn: Boolean(w.marketing_opt_in),
    visitCount: typeof w.visit_count === 'number' ? w.visit_count : 1,
  };
}

export const listWaiverSubmissionsHandler = asyncHandler(async (req, res) => {
  const limit = parseInt(req.query.limit as string) || 100;
  const rawWaivers = await AdminService.listWaiverSubmissions({ limit });
  const waivers = rawWaivers.map(transformWaiver);
  return res.status(200).json({ waivers });
});

export const getWaiverSubmissionHandler = asyncHandler(async (req, res) => {
  const submissionId = parseIntParam(req.params.id);
  const waiver = await AdminService.getWaiverSubmissionById(submissionId);
  if (!waiver) throw new AppError('Waiver submission not found', 404);
  return res.status(200).json({ waiver });
});

export const deleteWaiverSubmissionHandler = asyncHandler(async (req, res) => {
  const submissionId = parseIntParam(req.params.id);
  await AdminService.deleteWaiverSubmission(submissionId);
  return res.status(200).json({ success: true });
});

export const updateWaiverSubmissionHandler = asyncHandler(async (req, res) => {
  const submissionId = parseIntParam(req.params.id);

  const body = req.body as Record<string, unknown>;
  const updates: Record<string, unknown> = {};

  const setStringOrNull = (key: string, dbKey: string) => {
    if (!(key in body)) return;
    const value = body[key];
    if (value === null) {
      updates[dbKey] = null;
      return;
    }
    if (typeof value === 'string') {
      updates[dbKey] = value.trim();
      return;
    }
    throw new AppError(`Invalid ${key}`, 400);
  };

  setStringOrNull('guardianName', 'guardian_name');
  setStringOrNull('guardianEmail', 'guardian_email');
  setStringOrNull('guardianPhone', 'guardian_phone');
  setStringOrNull('guardianDateOfBirth', 'guardian_date_of_birth');
  setStringOrNull('relationshipToChildren', 'relationship_to_children');
  setStringOrNull('allergies', 'allergies');
  setStringOrNull('medicalNotes', 'medical_notes');
  setStringOrNull('insuranceProvider', 'insurance_provider');
  setStringOrNull('insurancePolicyNumber', 'insurance_policy_number');
  setStringOrNull('expiresAt', 'expires_at');

  if ('marketingOptIn' in body) {
    if (typeof body.marketingOptIn !== 'boolean') {
      throw new AppError('Invalid marketingOptIn', 400);
    }
    updates.marketing_opt_in = body.marketingOptIn;
  }

  if ('children' in body) {
    if (!Array.isArray(body.children)) {
      throw new AppError('Invalid children', 400);
    }
    updates.children = body.children;
  }

  if (Object.keys(updates).length === 0) {
    throw new AppError('No updates provided', 400);
  }

  const waiver = await AdminService.updateWaiverSubmission(
    submissionId,
    updates as Parameters<typeof AdminService.updateWaiverSubmission>[1],
  );
  publishAdminEvent('waiver.updated', { submissionId });
  return res.status(200).json({ waiver: transformWaiver(waiver as Record<string, unknown>) });
});

// ============= Ticket Purchases =============

// Transform DB ticket to frontend format
function transformTicket(t: Record<string, unknown>): Record<string, unknown> {
  const customer = t.customers as Record<string, unknown> | null;
  return {
    id: String(t.purchase_id),
    guardian: customer ? {
      firstName: customer.full_name?.toString().split(' ')[0],
      lastName: customer.full_name?.toString().split(' ').slice(1).join(' '),
      email: customer.email,
    } : null,
    type: t.ticket_type ?? 'General Admission',
    quantity: t.quantity ?? 1,
    total: t.total ?? 0,
    createdAt: t.created_at,
    codes: Array.isArray(t.codes) ? t.codes : [],
  };
}

export const listTicketPurchasesHandler = asyncHandler(async (req, res) => {
  const status = req.query.status as string | undefined;
  const limit = parseInt(req.query.limit as string) || 200;
  
  const rawTickets = await AdminService.listTicketPurchases({ status, limit });
  const tickets = rawTickets.map(transformTicket);
  return res.status(200).json({ tickets });
});

export const getTicketPurchaseHandler = asyncHandler(async (req, res) => {
  const purchaseId = parseIntParam(req.params.id);
  const ticket = await AdminService.getTicketPurchaseById(purchaseId);
  if (!ticket) throw new AppError('Ticket purchase not found', 404);
  return res.status(200).json({ ticket });
});

export const updateTicketPurchaseHandler = asyncHandler(async (req, res) => {
  const purchaseId = parseIntParam(req.params.id);
  const ticket = await AdminService.updateTicketPurchase(purchaseId, req.body);
  return res.status(200).json({ ticket });
});

export const redeemTicketCodeHandler = asyncHandler(async (req, res) => {
  const { purchaseId, code } = req.body;
  const rawTicket = await AdminService.redeemTicketCode(purchaseId, code);
  publishAdminEvent('ticket.redeemed', { purchaseId, code });
  const ticket = transformTicket(rawTicket as Record<string, unknown>);
  return res.status(200).json({ ticket });
});

// ============= App Payments =============
export const listAppPaymentsHandler = asyncHandler(async (req, res) => {
  const purpose = req.query.purpose as string | undefined;
  const status = req.query.status as string | undefined;
  const limit = parseInt(req.query.limit as string) || 100;
  
  const payments = await AdminService.listAppPayments({ purpose, status, limit });
  return res.status(200).json({ payments });
});

export const getAppPaymentHandler = asyncHandler(async (req, res) => {
  const paymentId = parseIntParam(req.params.id);
  const payment = await AdminService.getAppPaymentById(paymentId);
  if (!payment) throw new AppError('Payment not found', 404);
  return res.status(200).json({ payment });
});

export const updateAppPaymentHandler = asyncHandler(async (req, res) => {
  const paymentId = parseIntParam(req.params.id);
  const payment = await AdminService.updateAppPayment(paymentId, req.body);
  return res.status(200).json({ payment });
});

// ============= FAQs CRUD =============
export const listFAQsHandler = asyncHandler(async (req, res) => {
  const activeOnly = req.query.activeOnly === 'true';
  const faqs = await AdminService.listFAQs(activeOnly);
  return res.status(200).json({ faqs });
});

export const getFAQHandler = asyncHandler(async (req, res) => {
  const faqId = parseIntParam(req.params.id);
  const faq = await AdminService.getFAQById(faqId);
  if (!faq) throw new AppError('FAQ not found', 404);
  return res.status(200).json({ faq });
});

export const createFAQHandler = asyncHandler(async (req, res) => {
  const faq = await AdminService.createFAQ(req.body);
  return res.status(201).json({ faq });
});

export const updateFAQHandler = asyncHandler(async (req, res) => {
  const faqId = parseIntParam(req.params.id);
  const faq = await AdminService.updateFAQ(faqId, req.body);
  return res.status(200).json({ faq });
});

export const deleteFAQHandler = asyncHandler(async (req, res) => {
  const faqId = parseIntParam(req.params.id);
  await AdminService.deleteFAQ(faqId);
  return res.status(200).json({ success: true });
});

// ============= Testimonials CRUD =============
export const listTestimonialsHandler = asyncHandler(async (req, res) => {
  const featuredOnly = req.query.featuredOnly === 'true';
  const testimonials = await AdminService.listTestimonials(featuredOnly);
  return res.status(200).json({ testimonials });
});

export const getTestimonialHandler = asyncHandler(async (req, res) => {
  const testimonialId = parseIntParam(req.params.id);
  const testimonial = await AdminService.getTestimonialById(testimonialId);
  if (!testimonial) throw new AppError('Testimonial not found', 404);
  return res.status(200).json({ testimonial });
});

export const createTestimonialHandler = asyncHandler(async (req, res) => {
  const testimonial = await AdminService.createTestimonial(req.body);
  return res.status(201).json({ testimonial });
});

export const updateTestimonialHandler = asyncHandler(async (req, res) => {
  const testimonialId = parseIntParam(req.params.id);
  const testimonial = await AdminService.updateTestimonial(testimonialId, req.body);
  return res.status(200).json({ testimonial });
});

export const deleteTestimonialHandler = asyncHandler(async (req, res) => {
  const testimonialId = parseIntParam(req.params.id);
  await AdminService.deleteTestimonial(testimonialId);
  return res.status(200).json({ success: true });
});

// ============= Announcements CRUD =============
export const listAnnouncementsHandler = asyncHandler(async (req, res) => {
  const activeOnly = req.query.activeOnly === 'true';
  const announcements = await AdminService.listAnnouncements(activeOnly);
  return res.status(200).json({ announcements });
});

export const getAnnouncementHandler = asyncHandler(async (req, res) => {
  const announcementId = parseIntParam(req.params.id);
  const announcement = await AdminService.getAnnouncementById(announcementId);
  if (!announcement) throw new AppError('Announcement not found', 404);
  return res.status(200).json({ announcement });
});

export const createAnnouncementHandler = asyncHandler(async (req, res) => {
  const announcement = await AdminService.createAnnouncement(req.body) as { announcement_id: number };
  publishAdminEvent('announcement.created', { announcementId: announcement.announcement_id });
  return res.status(201).json({ announcement });
});

export const updateAnnouncementHandler = asyncHandler(async (req, res) => {
  const announcementId = parseIntParam(req.params.id);
  const announcement = await AdminService.updateAnnouncement(announcementId, req.body);
  publishAdminEvent('announcement.updated', { announcementId });
  return res.status(200).json({ announcement });
});

export const deleteAnnouncementHandler = asyncHandler(async (req, res) => {
  const announcementId = parseIntParam(req.params.id);
  await AdminService.deleteAnnouncement(announcementId);
  publishAdminEvent('announcement.deleted', { announcementId });
  return res.status(200).json({ success: true });
});

// ============= Ticket Types CRUD =============
export const listTicketTypesHandler = asyncHandler(async (req, res) => {
  const activeOnly = req.query.activeOnly === 'true';
  const ticketTypes = await AdminService.listTicketTypes(activeOnly);
  return res.status(200).json({ ticketTypes });
});

export const getTicketTypeHandler = asyncHandler(async (req, res) => {
  const ticketTypeId = parseIntParam(req.params.id);
  const ticketType = await AdminService.getTicketTypeById(ticketTypeId);
  if (!ticketType) throw new AppError('Ticket type not found', 404);
  return res.status(200).json({ ticketType });
});

export const createTicketTypeHandler = asyncHandler(async (req, res) => {
  const ticketType = await AdminService.createTicketType(req.body);
  return res.status(201).json({ ticketType });
});

export const updateTicketTypeHandler = asyncHandler(async (req, res) => {
  const ticketTypeId = parseIntParam(req.params.id);
  const ticketType = await AdminService.updateTicketType(ticketTypeId, req.body);
  return res.status(200).json({ ticketType });
});

export const deleteTicketTypeHandler = asyncHandler(async (req, res) => {
  const ticketTypeId = parseIntParam(req.params.id);
  await AdminService.deleteTicketType(ticketTypeId);
  return res.status(200).json({ success: true });
});

// ============= Locations CRUD =============
export const listLocationsHandler = asyncHandler(async (req, res) => {
  const activeOnly = req.query.activeOnly === 'true';
  const locations = await AdminService.listLocations(activeOnly);
  return res.status(200).json({ locations });
});

export const getLocationHandler = asyncHandler(async (req, res) => {
  const locationId = parseIntParam(req.params.id);
  const location = await AdminService.getLocationById(locationId);
  if (!location) throw new AppError('Location not found', 404);
  return res.status(200).json({ location });
});

export const createLocationHandler = asyncHandler(async (req, res) => {
  const location = await AdminService.createLocation(req.body);
  return res.status(201).json({ location });
});

export const updateLocationHandler = asyncHandler(async (req, res) => {
  const locationId = parseIntParam(req.params.id);
  const location = await AdminService.updateLocation(locationId, req.body);
  return res.status(200).json({ location });
});

export const deleteLocationHandler = asyncHandler(async (req, res) => {
  const locationId = parseIntParam(req.params.id);
  await AdminService.deleteLocation(locationId);
  return res.status(200).json({ success: true });
});

// ============= Resources CRUD =============
export const listResourcesHandler = asyncHandler(async (req, res) => {
  const activeOnly = req.query.activeOnly === 'true';
  const resources = await AdminService.listResources(activeOnly);
  return res.status(200).json({ resources });
});

export const getResourceHandler = asyncHandler(async (req, res) => {
  const resourceId = parseIntParam(req.params.id);
  const resource = await AdminService.getResourceById(resourceId);
  if (!resource) throw new AppError('Resource not found', 404);
  return res.status(200).json({ resource });
});

export const createResourceHandler = asyncHandler(async (req, res) => {
  const resource = await AdminService.createResource(req.body);
  return res.status(201).json({ resource });
});

export const updateResourceHandler = asyncHandler(async (req, res) => {
  const resourceId = parseIntParam(req.params.id);
  const resource = await AdminService.updateResource(resourceId, req.body);
  return res.status(200).json({ resource });
});

export const deleteResourceHandler = asyncHandler(async (req, res) => {
  const resourceId = parseIntParam(req.params.id);
  await AdminService.deleteResource(resourceId);
  return res.status(200).json({ success: true });
});

// ============= Export Functions =============
export const exportWaiversHandler = asyncHandler(async (_req, res) => {
  const waivers = await AdminService.exportWaiversToCsv();

  const maxChildren = Math.max(1, ...waivers.map(w => (w.children as unknown[])?.length ?? 0));

  const childHeaders: string[] = [];
  for (let i = 1; i <= maxChildren; i++) {
    childHeaders.push(`Child ${i} Name`, `Child ${i} DOB`, `Child ${i} Gender`);
  }

  const header = [
    'Guardian Name',
    'Guardian Email',
    'Guardian Phone',
    'Guardian DOB',
    'Relationship',
    'Allergies',
    'Medical Notes',
    'Insurance Provider',
    'Insurance Policy',
    ...childHeaders,
    'Signature',
    'Signed At',
    'Expires At',
    'Archive Until',
    'Accepted Policies',
    'Marketing Opt-in',
  ];

  const rows = waivers.map(waiver => {
    const children = (waiver.children ?? []) as Array<{ name: string; birthDate: string; gender?: string }>;
    const childData: string[] = [];
    for (let i = 0; i < maxChildren; i++) {
      const child = children[i];
      if (child) {
        childData.push(child.name, child.birthDate?.split('T')[0] ?? '', child.gender ?? '');
      } else {
        childData.push('', '', '');
      }
    }

    return [
      waiver.guardian_name,
      waiver.guardian_email ?? '',
      waiver.guardian_phone ?? '',
      waiver.guardian_date_of_birth ?? '',
      waiver.relationship_to_children ?? '',
      waiver.allergies ?? '',
      waiver.medical_notes ?? '',
      waiver.insurance_provider ?? '',
      waiver.insurance_policy_number ?? '',
      ...childData,
      waiver.signature,
      waiver.signed_at,
      waiver.expires_at ?? '',
      waiver.archive_until ?? '',
      (waiver.accepted_policies ?? []).join('; '),
      waiver.marketing_opt_in ? 'yes' : 'no',
    ];
  });

  const csv = buildCsv([header, ...rows]);

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="playfunia-waivers.csv"');
  return res.status(200).send(csv);
});

export const exportContactsHandler = asyncHandler(async (_req, res) => {
  const contacts = await AdminService.exportContactsToCsv();

  const rows = contacts.map(contact => [
    contact.name,
    contact.email,
    contact.phone ?? '',
    contact.marketingOptIn ? 'yes' : 'no',
  ]);

  const csv = buildCsv([['Name', 'Email', 'Phone', 'Marketing opt-in'], ...rows]);

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="playfunia-contacts.csv"');
  return res.status(200).send(csv);
});

// ============= Admin Event Stream =============
export function adminEventStreamHandler(req: Request, res: Response) {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  (res as Response & { flushHeaders?: () => void }).flushHeaders?.();

  const send = (event: AdminEvent) => {
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  };

  getRecentAdminEvents().forEach(send);

  const unsubscribe = subscribeAdminEvents(send);

  req.on('close', () => {
    unsubscribe();
    res.end();
  });
}
