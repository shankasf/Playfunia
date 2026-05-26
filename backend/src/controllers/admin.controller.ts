import type { Request, Response } from 'express';
import { DateTime } from 'luxon';

import * as AdminService from '../services/admin.service';
import { recordMembershipVisitByMembershipId, getMembershipDetails } from '../services/membership.service';
import type { SupabaseAuthenticatedRequest } from '../middleware/supabase-auth.middleware';
import { MembershipPlanRepository } from '../repositories';
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
  adminTeamUserCreateSchema,
  adminPasswordResetSchema,
  adminCustomerUpdateSchema,
  adminChildCreateSchema,
  adminChildUpdateSchema,
  adminEventCreateSchema,
  adminEventUpdateSchema,
  adminMembershipPlanCreateSchema,
  adminMembershipPlanUpdateSchema,
  adminWaiverUpdateSchema,
  adminJobApplicationStatusUpdateSchema,
  adminJobApplicationUpdateSchema,
  adminJobListingCreateSchema,
  adminJobListingUpdateSchema,
} from '../schemas/admin.schema';
import { adminCreateBookingSchema } from '../schemas/booking.schema';
import { sendTeamRoleAssignment } from '../services/email.service';
import { logger } from '../utils/logger';

function hasAdmin(roles: string[] | null | undefined): boolean {
  return (roles ?? []).includes('admin');
}
function hasStaff(roles: string[] | null | undefined): boolean {
  return (roles ?? []).some((r) => r === 'employee' || r === 'staff');
}

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

// ============= Roles =============
export const listRolesHandler = asyncHandler(async (_req, res) => {
  const roles = [
    { id: 'customer', name: 'Customer', description: 'Regular users who book parties, buy tickets' },
    { id: 'employee', name: 'Employee', description: 'Staff who check in members, redeem tickets, view dashboard' },
    { id: 'admin', name: 'Admin', description: 'Full system access, manage users, content, pricing' },
  ];
  return res.status(200).json({ roles });
});

// ============= Users CRUD =============
export const listUsersHandler = asyncHandler(async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit as string) || 50, 500);
  const offset = Math.max(parseInt(req.query.offset as string) || 0, 0);
  const search = req.query.search as string | undefined;
  const teamOnly = req.query.teamOnly === 'true';

  const result = await AdminService.listUsers({ limit, offset, search, teamOnly });
  return res.status(200).json(result);
});

export const getUserHandler = asyncHandler(async (req, res) => {
  const userId = parseIntParam(req.params.id);
  const user = await AdminService.getUserById(userId);
  if (!user) throw new AppError('User not found', 404);
  return res.status(200).json({ user });
});

export const createUserHandler = asyncHandler(async (req, res) => {
  const validated = adminTeamUserCreateSchema.parse(req.body);
  const user = await AdminService.createTeamUser({
    email: validated.email,
    password: validated.password,
    firstName: validated.first_name,
    lastName: validated.last_name,
    phone: validated.phone,
    role: validated.role,
  });
  publishAdminEvent('user.created', { userId: (user as { user_id?: number } | null)?.user_id });

  // Best-effort: email the new team member a summary of their access.
  try {
    await sendTeamRoleAssignment(validated.email, validated.role, validated.first_name);
  } catch (error) {
    logger.error({ err: error, email: validated.email }, 'Failed to send team welcome email');
  }

  return res.status(201).json({ user });
});

export const resetUserPasswordHandler = asyncHandler(async (req, res) => {
  const userId = parseIntParam(req.params.id);
  const { password } = adminPasswordResetSchema.parse(req.body);
  await AdminService.resetUserPassword(userId, password);
  return res.status(200).json({ success: true });
});

export const updateUserHandler = asyncHandler(async (req, res) => {
  const userId = parseIntParam(req.params.id);
  const validated = adminUserUpdateSchema.parse(req.body);
  const previous = await AdminService.getUserById(userId);
  const user = await AdminService.updateUser(userId, validated);
  publishAdminEvent('user.updated', { userId });

  // Notify the user when they're newly granted a team role (admin > staff).
  // Best-effort: never let a mail failure break the role update.
  const prevRoles = (previous as { roles?: string[] } | null)?.roles ?? [];
  const nextRoles = (user as { roles?: string[] } | null)?.roles ?? [];
  let grantedRole: 'admin' | 'employee' | null = null;
  if (hasAdmin(nextRoles) && !hasAdmin(prevRoles)) {
    grantedRole = 'admin';
  } else if (hasStaff(nextRoles) && !hasStaff(prevRoles)) {
    grantedRole = 'employee';
  }
  if (grantedRole) {
    const recipient = (user as { email?: string } | null)?.email;
    const firstName = (user as { first_name?: string } | null)?.first_name
      ?? (previous as { first_name?: string } | null)?.first_name
      ?? undefined;
    if (recipient) {
      try {
        await sendTeamRoleAssignment(recipient, grantedRole, firstName);
      } catch (error) {
        logger.error({ err: error, userId, grantedRole }, 'Failed to send team role assignment email');
      }
    }
  }

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
  const limit = Math.min(parseInt(req.query.limit as string) || 50, 500);
  const offset = Math.max(parseInt(req.query.offset as string) || 0, 0);
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
  const limit = Math.min(parseInt(req.query.limit as string) || 100, 500);
  
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

// ============= Event Photos & Posters =============
import { EventPhotoRepository } from '../repositories';
import * as EventImageService from '../services/event-image.service';

export const uploadEventPosterHandler = asyncHandler(async (req, res) => {
  const eventId = parseIntParam(req.params.id);
  const file = req.file;
  if (!file) throw new AppError('No poster file uploaded', 400);

  const publicUrl = await EventImageService.uploadEventPoster({
    buffer: file.buffer,
    originalname: file.originalname,
    mimetype: file.mimetype,
    size: file.size,
  });

  // Update the event's image_url
  await AdminService.updateEvent(eventId, { image_url: publicUrl } as Record<string, unknown>);
  publishAdminEvent('event.updated', { eventId });

  return res.status(200).json({ imageUrl: publicUrl });
});

export const uploadEventPhotosHandler = asyncHandler(async (req, res) => {
  const eventId = parseIntParam(req.params.id);
  const files = req.files as Express.Multer.File[] | undefined;
  if (!files || files.length === 0) throw new AppError('No photo files uploaded', 400);

  const rawPhotos = await EventImageService.uploadEventPhotos(
    eventId,
    files.map(f => ({
      buffer: f.buffer,
      originalname: f.originalname,
      mimetype: f.mimetype,
      size: f.size,
    })),
  );

  const photos = rawPhotos.map(p => ({
    id: p.photo_id,
    url: p.photo_url,
    storagePath: p.storage_path,
    caption: p.caption,
    displayOrder: p.display_order,
    mediaType: p.media_type ?? 'image',
  }));

  return res.status(201).json({ photos });
});

export const getEventPhotosHandler = asyncHandler(async (req, res) => {
  const eventId = parseIntParam(req.params.id);
  const photos = await EventPhotoRepository.findByEventId(eventId);
  return res.status(200).json({
    photos: photos.map((p: Record<string, unknown>) => ({
      id: p.photo_id,
      url: p.photo_url,
      storagePath: p.storage_path,
      caption: p.caption,
      displayOrder: p.display_order,
      mediaType: (p.media_type as string) ?? 'image',
    })),
  });
});

export const deleteEventPhotoHandler = asyncHandler(async (req, res) => {
  const photoId = parseIntParam(req.params.photoId);
  await EventImageService.deleteEventPhoto(photoId);
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

// Tier code to plan name mapping (structural domain model, not pricing data)
const REVERSE_TIER_MAP: Record<string, string[]> = {
  'explorer': ['Silver'],
  'adventurer': ['Gold'],
  'champion': ['Platinum', 'VIP Platinum'],
  'mini': ['Mini Plan'],
  'super': ['Super Plan'],
  'mega': ['Mega Plan'],
};

// Plan info type used by buildPlansMap and transformMembership
type PlanInfo = {
  name: string;
  discount_percent: number;
  guest_passes_per_month: number;
  visits_per_month: number | null;
  max_children: number | null;
  max_adults: number | null;
};

// Transform DB membership to frontend format using DB plan data
function transformMembership(
  m: Record<string, unknown>,
  plansMap: Map<string, PlanInfo>,
): Record<string, unknown> {
  const customer = m.customers as Record<string, unknown> | null;
  const tier = (m.tier as string) ?? 'explorer';

  // Look up plan info from DB plans map
  const planNames = REVERSE_TIER_MAP[tier] ?? [];
  let planInfo: PlanInfo | undefined;
  for (const name of planNames) {
    if (plansMap.has(name)) {
      planInfo = plansMap.get(name);
      break;
    }
  }

  // Also try direct plan name from joined membership_plans
  if (!planInfo) {
    const joinedPlan = m.membership_plans as Record<string, unknown> | null;
    const joinedPlanName = joinedPlan?.name as string | undefined;
    if (joinedPlanName && plansMap.has(joinedPlanName)) {
      planInfo = plansMap.get(joinedPlanName);
    }
  }

  const tierName = planInfo?.name ?? tier;
  const discountPercent = planInfo?.discount_percent ?? 0;
  const guestPassesPerMonth = planInfo?.guest_passes_per_month ?? 0;

  const visitsPerMonth = (m.visits_per_month as number | null) ?? planInfo?.visits_per_month ?? null;
  const visitsUsed = (m.visits_used_this_period as number) ?? 0;
  const visitsRemaining = visitsPerMonth !== null ? visitsPerMonth - visitsUsed : null;

  // Calculate remaining days from end_date
  const endDateStr = m.end_date as string | null;
  const status = (m.status as string) ?? 'active';
  let remainingDays: number | null = null;
  if (endDateStr && status === 'active') {
    const endDt = DateTime.fromISO(endDateStr).setZone('America/New_York');
    const nowDt = DateTime.now().setZone('America/New_York').startOf('day');
    remainingDays = Math.max(0, Math.ceil(endDt.diff(nowDt, 'days').days));
  }

  // Extract children attached by service layer
  const rawChildren = (m._children as Array<Record<string, unknown>>) ?? [];
  const children = rawChildren.map(c => ({
    id: c.child_id as number,
    firstName: c.first_name as string,
    lastName: (c.last_name as string | null) ?? null,
    photoUrl: (c.photo_url as string | null) ?? null,
  }));

  // Try to get user info from customer
  const fullName = customer?.full_name?.toString() ?? '';
  const nameParts = fullName.split(' ');

  return {
    userId: String(m.customer_id ?? ''),
    firstName: nameParts[0] ?? '',
    lastName: nameParts.slice(1).join(' ') ?? '',
    email: customer?.email ?? '',
    displayId: (m.display_id as string | null) ?? null,
    children,
    membership: {
      membershipId: String(m.membership_id),
      tierName,
      status,
      autoRenew: m.auto_renew ?? true,
      startDate: (m.start_date as string | null) ?? null,
      endDate: endDateStr ?? null,
      remainingDays,
      visitsPerMonth,
      visitsUsed,
      visitsRemaining,
      maxChildren: planInfo?.max_children ?? 1,
      maxAdults: planInfo?.max_adults ?? 1,
      visitPeriodStart: m.visit_period_start?.toString() ?? null,
      lastVisitAt: m.last_visit_at?.toString() ?? null,
      discountPercent,
      guestPassesPerMonth,
      referralName: (m.referral_name as string | null) ?? null,
      referralStatus: (m.referral_status as string | null) ?? null,
    },
  };
}

// Build plans map from DB for membership transformation (include inactive plans for legacy memberships)
async function buildPlansMap() {
  const plans = await MembershipPlanRepository.findAll(false);
  return new Map(plans.map(p => [p.name, {
    name: p.name,
    discount_percent: p.discount_percent ?? 0,
    guest_passes_per_month: p.guest_passes_per_month ?? 0,
    visits_per_month: p.visits_per_month,
    max_children: ((p as Record<string, unknown>).max_children as number | null) ?? 1,
    max_adults: ((p as Record<string, unknown>).max_adults as number | null) ?? 1,
  }]));
}

export const listMembershipsHandler = asyncHandler(async (req, res) => {
  const status = req.query.status as string | undefined;
  const limit = parseInt(req.query.limit as string) || 100;

  const [rawMemberships, plansMap] = await Promise.all([
    AdminService.listMemberships({ status, limit }),
    buildPlansMap(),
  ]);
  const memberships = rawMemberships.map((m: Record<string, unknown>) => transformMembership(m, plansMap));
  return res.status(200).json({ memberships });
});

export const getMembershipHandler = asyncHandler(async (req, res) => {
  const membershipId = parseIntParam(req.params.id);
  const [membership, plansMap] = await Promise.all([
    AdminService.getMembershipById(membershipId),
    buildPlansMap(),
  ]);
  if (!membership) throw new AppError('Membership not found', 404);
  return res.status(200).json({ membership: transformMembership(membership as Record<string, unknown>, plansMap) });
});

export const createMembershipHandler = asyncHandler(async (req, res) => {
  // Check if this is a manual membership creation (has guestName field)
  if (req.body.guestName) {
    const { guestName, guestEmail, guestPhone, childName, password, planId, tier, durationMonths, monthlyPrice, total, paymentMethod, paymentStatus, notes } = req.body;
    if (!planId || !tier) throw new AppError('Plan and tier are required', 400);
    if (!guestEmail) throw new AppError('Email is required to create a user account', 400);
    if (!password || password.length < 6) throw new AppError('Password is required (min 6 characters)', 400);

    const result = await AdminService.createMembershipManually({
      guestName,
      guestEmail,
      guestPhone: guestPhone || undefined,
      childName: childName || undefined,
      password,
      planId: typeof planId === 'string' ? parseInt(planId, 10) : planId,
      tier,
      durationMonths: durationMonths || 1,
      monthlyPrice: monthlyPrice || 0,
      total: total || 0,
      paymentMethod: paymentMethod || 'cash',
      paymentStatus: paymentStatus || 'paid',
      notes: notes || undefined,
    });

    publishAdminEvent('membership.created', { membershipId: result.membershipId, displayId: result.displayId, manual: true });
    return res.status(201).json(result);
  }

  // Original: create from standard data
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

export const recordMembershipVisitHandler = asyncHandler(async (req: Request, res: Response) => {
  const membershipId = parseIntParam(req.params.membershipId);
  const authReq = req as SupabaseAuthenticatedRequest;
  const staffUserId = authReq.user?.id ? parseInt(authReq.user.id, 10) : undefined;
  const { childrenCount, adultsCount, notes } = req.body ?? {};
  const result = await recordMembershipVisitByMembershipId(membershipId, {
    childrenCount: typeof childrenCount === 'number' ? childrenCount : 0,
    adultsCount: typeof adultsCount === 'number' ? adultsCount : 0,
    notes: typeof notes === 'string' ? notes : undefined,
    staffUserId,
  });
  return res.status(200).json(result);
});

// ============= Enhanced Membership Stats =============
export const getMembershipStatsHandler = asyncHandler(async (_req, res) => {
  const stats = await AdminService.getMembershipStats();
  return res.status(200).json(stats);
});

export const listUnmatchedReferralsHandler = asyncHandler(async (_req, res) => {
  const referrals = await AdminService.listUnmatchedReferrals();
  return res.status(200).json({ referrals });
});

export const matchReferralHandler = asyncHandler(async (req, res) => {
  const membershipId = parseIntParam(req.params.membershipId);
  const { staffUserId } = req.body;
  if (!staffUserId || typeof staffUserId !== 'number') {
    throw new AppError('staffUserId is required', 400);
  }
  const result = await AdminService.matchReferral(membershipId, staffUserId);
  return res.status(200).json({ membership: result });
});

export const listStaffMembersHandler = asyncHandler(async (_req, res) => {
  const staff = await AdminService.listStaffMembers();
  return res.status(200).json({ staff });
});

export const getStaffReferralStatsHandler = asyncHandler(async (req, res) => {
  const userId = parseIntParam(req.params.userId);
  const stats = await AdminService.getStaffReferralStats(userId);
  return res.status(200).json(stats);
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
  
  // Parse scheduled_start for date and time in ET (America/New_York)
  let eventDate = '';
  let startTime = '';
  let endTime = '';

  if (b.scheduled_start) {
    const start = DateTime.fromISO(b.scheduled_start as string).setZone('America/New_York');
    eventDate = start.toFormat('yyyy-MM-dd');
    startTime = start.toFormat('HH:mm');
  }

  if (b.end_time) {
    // Use the stored party end time (without cleaning buffer)
    endTime = (b.end_time as string).slice(0, 5);
  } else if (b.scheduled_end) {
    // Fallback for older bookings: scheduled_end includes 30-min cleaning buffer
    const end = DateTime.fromISO(b.scheduled_end as string).setZone('America/New_York').minus({ minutes: 30 });
    endTime = end.toFormat('HH:mm');
  }

  // Use actual DB column names
  const totalAmount = Number(b.total) || 0;
  const depositPaid = Number(b.deposit_amount) || 0;
  const balanceRemaining = b.balance_remaining != null ? Number(b.balance_remaining) : (totalAmount - depositPaid);

  // Guest booking info (stored in notes field for guest bookings)
  const guestName = b.guest_name?.toString() ?? null;
  const guestEmail = b.guest_email?.toString() ?? null;
  const guestPhone = b.guest_phone?.toString() ?? null;

  return {
    id: String(b.booking_id),
    reference: b.reference?.toString() ?? '',
    location: b.location_name?.toString() ?? '',
    eventDate,
    startTime,
    endTime,
    guests: Number(b.guests) || 0,
    total: Number(b.total) || 0,
    subtotal: Number(b.subtotal) || 0,
    cleaningFee: Number(b.cleaning_fee) || 0,
    status: b.status ?? 'Pending',
    paymentStatus: b.payment_status ?? 'awaiting_deposit',
    depositAmount: depositPaid,
    balanceRemaining,
    paymentOption: b.payment_option?.toString() ?? null,
    onlinePaymentAmount: Number(b.online_payment_amount) || 0,
    venuePaymentAmount: Number(b.venue_payment_amount) || 0,
    notes: b.notes ?? null,
    privateNotes: b.private_notes ?? null,
    addOns: Array.isArray(b.add_ons) ? b.add_ons : [],
    children: Array.isArray(b._resolvedChildren)
      ? (b._resolvedChildren as Record<string, unknown>[]).map((c) => ({
          name: `${c.first_name || ''} ${c.last_name || ''}`.trim(),
          birthDate: c.birth_date?.toString() ?? null,
        }))
      : [],
    createdAt: b.created_at?.toString() ?? null,
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
    guestName,
    guestEmail,
    guestPhone,
    receipt: b._receipt ? {
      receiptNumber: (b._receipt as Record<string, unknown>).receipt_number?.toString() ?? null,
      totalUsd: Number((b._receipt as Record<string, unknown>).total_usd) || 0,
      taxUsd: Number((b._receipt as Record<string, unknown>).tax_usd) || 0,
      subtotalUsd: Number((b._receipt as Record<string, unknown>).subtotal_usd) || 0,
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
  // Resolve children and receipt for single booking
  let resolvedArr = await AdminService.resolveBookingChildrenPublic([rawBooking as unknown as Record<string, unknown>]);
  resolvedArr = await AdminService.resolveBookingReceiptsPublic(resolvedArr);
  const booking = transformBooking(resolvedArr[0] ?? rawBooking as unknown as Record<string, unknown>);
  return res.status(200).json({ booking });
});

export const updateBookingHandler = asyncHandler(async (req, res) => {
  const bookingId = parseIntParam(req.params.id);
  
  // Transform frontend field names to database field names
  const { status, eventDate, startTime, location, notes, privateNotes,
    guestName, guestEmail, guestPhone, guests, total, paymentStatus } = req.body as {
    status?: string;
    eventDate?: string;
    startTime?: string;
    location?: string;
    notes?: string;
    privateNotes?: string;
    guestName?: string;
    guestEmail?: string;
    guestPhone?: string;
    guests?: number;
    total?: number;
    paymentStatus?: string;
  };

  const dbUpdates: Record<string, unknown> = {};

  if (status !== undefined) dbUpdates.status = status;
  if (notes !== undefined) dbUpdates.notes = notes;
  if (privateNotes !== undefined) dbUpdates.private_notes = privateNotes;
  if (location !== undefined) dbUpdates.location_name = location;
  if (guestName !== undefined) dbUpdates.guest_name = guestName;
  if (guestEmail !== undefined) dbUpdates.guest_email = guestEmail || null;
  if (guestPhone !== undefined) dbUpdates.guest_phone = guestPhone || null;
  if (guests !== undefined) dbUpdates.guests = guests;
  if (total !== undefined) {
    dbUpdates.total = total;
    dbUpdates.subtotal = total;
  }
  if (paymentStatus !== undefined) {
    dbUpdates.payment_status = paymentStatus;
    // Auto-update deposit/balance based on payment status
    const currentTotal = total ?? (await AdminService.getBookingById(bookingId) as any)?.total ?? 0;
    if (paymentStatus === 'paid') {
      dbUpdates.deposit_amount = currentTotal;
      dbUpdates.balance_remaining = 0;
    } else if (paymentStatus === 'awaiting_deposit' || paymentStatus === 'awaiting_full_payment') {
      dbUpdates.deposit_amount = 0;
      dbUpdates.balance_remaining = currentTotal;
    }
  }
  
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
    const newDate = eventDate ?? (existingStart ? DateTime.fromJSDate(existingStart).setZone('America/New_York').toFormat('yyyy-MM-dd') : '');
    const newTime = startTime ?? (existingStart ? DateTime.fromJSDate(existingStart).setZone('America/New_York').toFormat('HH:mm') : '10:00');
    
    if (newDate && newTime) {
      const newStart = DateTime.fromISO(`${newDate}T${newTime}`, { zone: 'America/New_York' });
      const newEnd = newStart.plus({ milliseconds: durationMs });

      dbUpdates.scheduled_start = newStart.toISO();
      dbUpdates.scheduled_end = newEnd.toISO();
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

export const deleteBookingHandler = asyncHandler(async (req, res) => {
  const bookingId = parseIntParam(req.params.id);
  await AdminService.deleteBooking(bookingId);
  publishAdminEvent('booking.deleted', { bookingId });
  return res.status(200).json({ success: true });
});

// ============= Admin Manual Booking =============
export const createManualBookingHandler = asyncHandler(async (req, res) => {
  const validated = adminCreateBookingSchema.parse(req.body);

  const packageId = parseInt(validated.partyPackageId, 10);
  if (isNaN(packageId)) throw new AppError('Invalid package ID', 400);

  const booking = await AdminService.createManualBooking({
    packageId,
    guestName: validated.guestName,
    guestEmail: validated.guestEmail || undefined,
    guestPhone: validated.guestPhone || undefined,
    childName: validated.childName || undefined,
    location: validated.location,
    eventDate: validated.eventDate,
    startTime: validated.startTime,
    endTime: validated.endTime || undefined,
    guests: validated.guests,
    total: validated.total,
    paymentMethod: validated.paymentMethod,
    paymentStatus: validated.paymentStatus,
    notes: validated.notes || undefined,
    privateNotes: validated.privateNotes || undefined,
  });

  publishAdminEvent('booking.created', {
    bookingId: (booking as any).booking_id,
    reference: (booking as any).reference,
    manual: true,
    paymentMethod: validated.paymentMethod,
  });

  const transformed = transformBooking(booking as unknown as Record<string, unknown>);
  // Include receipt info if generated
  if ((booking as any)._receiptNumber) {
    (transformed as any).receiptNumber = (booking as any)._receiptNumber;
  }
  return res.status(201).json({ booking: transformed });
});

// ============= Admin Issue Tickets =============
export const issueTicketsHandler = asyncHandler(async (req, res) => {
  const { guestName, guestEmail, guestPhone, ticketTypeId, quantity, unitPrice, total, paymentMethod } = req.body as {
    guestName: string;
    guestEmail?: string;
    guestPhone?: string;
    ticketTypeId?: number;
    quantity: number;
    unitPrice: number;
    total: number;
    paymentMethod: string;
  };

  if (!guestName || !quantity || quantity < 1) {
    throw new AppError('Customer name and quantity are required', 400);
  }

  const result = await AdminService.issueTicketsManually({
    guestName,
    guestEmail,
    guestPhone,
    ticketTypeId,
    quantity,
    unitPrice,
    total,
    paymentMethod,
  });

  publishAdminEvent('ticket.created', {
    purchaseId: result.purchaseId,
    manual: true,
    quantity,
  });

  return res.status(201).json(result);
});

// ============= Waiver Users CRUD =============
export const listWaiverUsersHandler = asyncHandler(async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit as string) || 100, 500);
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
  // Build guardian name from first/last or use existing guardian_name (from backward compat mapping)
  const guardianName = w.guardian_name ?? `${w.guardian_first_name || ''} ${w.guardian_last_name || ''}`.trim();
  return {
    id: String(w.submission_id),
    guardianFirstName: w.guardian_first_name ?? '',
    guardianLastName: w.guardian_last_name ?? '',
    guardianName: guardianName,
    guardianEmail: w.guardian_email ?? '',
    guardianPhone: w.guardian_phone ?? '',
    guardianDateOfBirth: w.guardian_date_of_birth,
    relationshipToMinor: w.relationship_to_minor ?? w.relationship_to_children,
    guardian: w.customers ?? w.waiver_users ?? null,
    children: Array.isArray(w.children) ? w.children : [],
    digitalSignature: w.digital_signature ?? w.signature,
    signedAt: w.date_signed ?? w.signed_at ?? w.created_at,
    expiresAt: w.expires_at,
    marketingSmsOptIn: Boolean(w.marketing_sms_opt_in),
    marketingEmailOptIn: Boolean(w.marketing_email_opt_in),
    marketingOptIn: Boolean(w.marketing_sms_opt_in || w.marketing_email_opt_in || w.marketing_opt_in),
    visitCount: typeof w.visit_count === 'number' ? w.visit_count : 1,
  };
}

export const listWaiverSubmissionsHandler = asyncHandler(async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit as string) || 5000, 5000);
  const rawWaivers = await AdminService.listWaiverSubmissions({ limit });
  const waivers = rawWaivers.map(transformWaiver);
  return res.status(200).json({ waivers });
});

export const getWaiverSubmissionHandler = asyncHandler(async (req, res) => {
  const submissionId = parseIntParam(req.params.id);
  const waiver = await AdminService.getWaiverSubmissionById(submissionId);
  if (!waiver) throw new AppError('Waiver submission not found', 404);
  return res.status(200).json({ waiver: transformWaiver(waiver) });
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

  setStringOrNull('guardianFirstName', 'guardian_first_name');
  setStringOrNull('guardianLastName', 'guardian_last_name');
  setStringOrNull('guardianEmail', 'guardian_email');
  setStringOrNull('guardianPhone', 'guardian_phone');
  setStringOrNull('guardianDateOfBirth', 'guardian_date_of_birth');
  setStringOrNull('relationshipToMinor', 'relationship_to_minor');
  setStringOrNull('expiresAt', 'expires_at');

  if ('marketingSmsOptIn' in body) {
    if (typeof body.marketingSmsOptIn !== 'boolean') {
      throw new AppError('Invalid marketingSmsOptIn', 400);
    }
    updates.marketing_sms_opt_in = body.marketingSmsOptIn;
  }

  if ('marketingEmailOptIn' in body) {
    if (typeof body.marketingEmailOptIn !== 'boolean') {
      throw new AppError('Invalid marketingEmailOptIn', 400);
    }
    updates.marketing_email_opt_in = body.marketingEmailOptIn;
  }

  // Note: children are stored in waiver_user_children table, not in waiver_submissions
  // To update children, use the waiver user children endpoints

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
  return res.status(200).json({ ticket: transformTicket(ticket) });
});

export const updateTicketPurchaseHandler = asyncHandler(async (req, res) => {
  const purchaseId = parseIntParam(req.params.id);
  const ticket = await AdminService.updateTicketPurchase(purchaseId, req.body);
  return res.status(200).json({ ticket });
});

export const redeemTicketCodeHandler = asyncHandler(async (req, res) => {
  const { purchaseId, code } = req.body;
  if (!purchaseId || !code) {
    throw new AppError('purchaseId and code are required', 400);
  }
  const parsedPurchaseId = typeof purchaseId === 'string' ? parseInt(purchaseId, 10) : purchaseId;
  if (isNaN(parsedPurchaseId)) {
    throw new AppError('Invalid purchaseId', 400);
  }
  const rawTicket = await AdminService.redeemTicketCode(parsedPurchaseId, code);
  publishAdminEvent('ticket.redeemed', { purchaseId: parsedPurchaseId, code });
  const ticket = transformTicket(rawTicket as Record<string, unknown>);
  return res.status(200).json({ ticket });
});

/**
 * Validate a ticket code (check if it's valid without redeeming)
 * POST /admin/tickets/validate
 */
export const validateTicketCodeHandler = asyncHandler(async (req, res) => {
  const { code } = req.body;
  if (!code || typeof code !== 'string') {
    throw new AppError('Ticket code is required', 400);
  }

  const result = await AdminService.validateTicketCode(code);
  return res.status(200).json(result);
});

/**
 * Look up a ticket by its code
 * GET /admin/tickets/lookup/:code
 */
export const lookupTicketByCodeHandler = asyncHandler(async (req, res) => {
  const { code } = req.params;
  if (!code) {
    throw new AppError('Ticket code is required', 400);
  }

  const result = await AdminService.lookupTicketByCode(code);
  if (!result) {
    throw new AppError('Ticket code not found', 404);
  }

  const { purchase, codeEntry } = result;
  return res.status(200).json({
    ticket: {
      purchaseId: purchase.purchase_id,
      code: codeEntry?.code,
      status: codeEntry?.status,
      redeemedAt: codeEntry?.redeemedAt || null,
      ticketType: purchase.ticket_type,
      quantity: purchase.quantity,
      eventId: purchase.event_id,
      customer: purchase.customers || null,
      createdAt: purchase.created_at,
      allCodes: purchase.codes,
    },
  });
});

/**
 * Redeem a ticket by code only (no purchaseId needed)
 * POST /admin/tickets/redeem-code
 */
export const redeemTicketByCodeHandler = asyncHandler(async (req, res) => {
  const { code, redeemedBy } = req.body;
  if (!code || typeof code !== 'string') {
    throw new AppError('Ticket code is required', 400);
  }

  const ticket = await AdminService.redeemTicketByCode(code, redeemedBy);
  publishAdminEvent('ticket.redeemed', { code, redeemedBy });
  return res.status(200).json({ ticket });
});

/**
 * Delete a ticket purchase
 * DELETE /admin/tickets/:id
 */
export const deleteTicketPurchaseHandler = asyncHandler(async (req, res) => {
  const purchaseId = parseIntParam(req.params.id);
  await AdminService.deleteTicketPurchase(purchaseId);
  publishAdminEvent('ticket.deleted', { purchaseId });
  return res.status(200).json({ success: true, message: 'Ticket purchase deleted' });
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
export const exportWaiversHandler = asyncHandler(async (req, res) => {
  const dateFrom = typeof req.query.dateFrom === 'string' ? req.query.dateFrom : undefined;
  const dateTo = typeof req.query.dateTo === 'string' ? req.query.dateTo : undefined;
  const waivers = await AdminService.exportWaiversToCsv(dateFrom, dateTo);

  const maxChildren = Math.max(1, ...waivers.map(w => (w.children as unknown[])?.length ?? 0));

  const childHeaders: string[] = [];
  for (let i = 1; i <= maxChildren; i++) {
    childHeaders.push(`Child ${i} Name`, `Child ${i} DOB`, `Child ${i} Gender`);
  }

  const header = [
    'Parent Name',
    'Guardian First Name',
    'Guardian Last Name',
    'Guardian Email',
    'Guardian Phone',
    'Guardian DOB',
    'Relationship',
    ...childHeaders,
    'Digital Signature',
    'Signature Image',
    'Timestamp',
    'Expires At',
    'Archive Until',
    'Accepted Policies',
    'Marketing SMS Opt-in',
    'Marketing Email Opt-in',
  ];

  const rows = waivers.map(waiver => {
    const parentName = `${waiver.guardian_first_name || ''} ${waiver.guardian_last_name || ''}`.trim();
    const children = (waiver.children ?? []) as Array<{ name?: string; first_name?: string; last_name?: string; birthDate?: string; birth_date?: string; gender?: string }>;
    const childData: string[] = [];
    for (let i = 0; i < maxChildren; i++) {
      const child = children[i];
      if (child) {
        const childName = child.name || `${child.first_name || ''} ${child.last_name || ''}`.trim();
        const childDob = (child.birthDate || child.birth_date || '')?.split('T')[0] ?? '';
        childData.push(childName, childDob, child.gender ?? '');
      } else {
        childData.push('', '', '');
      }
    }

    return [
      parentName,
      waiver.guardian_first_name ?? '',
      waiver.guardian_last_name ?? '',
      waiver.guardian_email ?? '',
      waiver.guardian_phone ?? '',
      waiver.guardian_date_of_birth ?? '',
      waiver.relationship_to_minor ?? '',
      ...childData,
      waiver.digital_signature ?? '',
      waiver.signature_image_url ?? '',
      waiver.date_signed ?? '',
      waiver.expires_at ?? '',
      waiver.archive_until ?? '',
      (waiver.accepted_policies ?? []).join('; '),
      waiver.marketing_sms_opt_in ? 'yes' : 'no',
      waiver.marketing_email_opt_in ? 'yes' : 'no',
    ];
  });

  const csv = buildCsv([header, ...rows]);

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="playfunia-waivers.csv"');
  res.setHeader('Cache-Control', 'no-store');
  res.removeHeader('ETag');
  return res.status(200).send(csv);
});

export const exportContactsHandler = asyncHandler(async (req, res) => {
  const dateFrom = typeof req.query.dateFrom === 'string' ? req.query.dateFrom : undefined;
  const dateTo = typeof req.query.dateTo === 'string' ? req.query.dateTo : undefined;
  const contacts = await AdminService.exportContactsToCsv(dateFrom, dateTo);

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

// ============= Job Applications =============
export const listJobApplicationsHandler = asyncHandler(async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit as string) || 50, 500);
  const offset = Math.max(parseInt(req.query.offset as string) || 0, 0);
  const status = req.query.status as string | undefined;
  const listingId = req.query.listingId ? parseInt(req.query.listingId as string) : undefined;
  const search = req.query.search as string | undefined;
  const dateFrom = req.query.dateFrom as string | undefined;
  const dateTo = req.query.dateTo as string | undefined;

  const result = await AdminService.listJobApplications({
    status, listingId, search, dateFrom, dateTo, limit, offset,
  });
  return res.status(200).json({ applications: result.data, total: result.count });
});

export const getJobApplicationHandler = asyncHandler(async (req, res) => {
  const applicationId = parseIntParam(req.params.id);
  const application = await AdminService.getJobApplicationById(applicationId);
  if (!application) throw new AppError('Job application not found', 404);

  // Generate signed URLs for resume and video if storage paths exist
  let resumeUrl: string | null = null;
  let videoUrl: string | null = null;

  if (application.resume_storage_path) {
    try {
      resumeUrl = await AdminService.getApplicationResumeSignedUrl(application.resume_storage_path);
    } catch {
      // Storage error - file may not exist
    }
  }
  if (application.video_storage_path) {
    try {
      videoUrl = await AdminService.getApplicationVideoSignedUrl(application.video_storage_path);
    } catch {
      // Storage error - file may not exist
    }
  }

  return res.status(200).json({ application, resumeUrl, videoUrl });
});

export const updateJobApplicationStatusHandler = asyncHandler(async (req, res) => {
  const applicationId = parseIntParam(req.params.id);
  const validated = adminJobApplicationStatusUpdateSchema.parse(req.body);
  const application = await AdminService.updateJobApplicationStatus(
    applicationId, validated.status, validated.admin_notes,
  );
  return res.status(200).json({ application });
});

export const deleteJobApplicationHandler = asyncHandler(async (req, res) => {
  const applicationId = parseIntParam(req.params.id);
  await AdminService.deleteJobApplication(applicationId);
  return res.status(200).json({ message: 'Application deleted successfully' });
});

export const listJobListingsForFilterHandler = asyncHandler(async (_req, res) => {
  const listings = await AdminService.getJobListingsForFilter();
  return res.status(200).json({ listings });
});

export const updateJobApplicationHandler = asyncHandler(async (req, res) => {
  const applicationId = parseIntParam(req.params.id);
  const validated = adminJobApplicationUpdateSchema.parse(req.body);
  const application = await AdminService.updateJobApplication(applicationId, validated);
  return res.status(200).json({ application });
});

// ============= Job Listings CRUD =============
export const listJobListingsHandler = asyncHandler(async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit as string) || 100, 500);
  const offset = Math.max(parseInt(req.query.offset as string) || 0, 0);
  const search = req.query.search as string | undefined;
  const isActiveParam = req.query.isActive as string | undefined;
  const isActive = isActiveParam === 'true' ? true : isActiveParam === 'false' ? false : undefined;

  const result = await AdminService.listJobListingsForAdmin({ isActive, search, limit, offset });
  return res.status(200).json({ listings: result.data, total: result.count });
});

export const getJobListingHandler = asyncHandler(async (req, res) => {
  const listingId = parseIntParam(req.params.id);
  const listing = await AdminService.getJobListingById(listingId);
  if (!listing) throw new AppError('Job listing not found', 404);
  return res.status(200).json({ listing });
});

export const createJobListingHandler = asyncHandler(async (req, res) => {
  const validated = adminJobListingCreateSchema.parse(req.body);
  const listing = await AdminService.createJobListing(validated);
  return res.status(201).json({ listing });
});

export const updateJobListingHandler = asyncHandler(async (req, res) => {
  const listingId = parseIntParam(req.params.id);
  const validated = adminJobListingUpdateSchema.parse(req.body);
  const listing = await AdminService.updateJobListing(listingId, validated);
  return res.status(200).json({ listing });
});

export const deleteJobListingHandler = asyncHandler(async (req, res) => {
  const listingId = parseIntParam(req.params.id);
  await AdminService.deleteJobListing(listingId);
  return res.status(200).json({ message: 'Job listing deleted successfully' });
});

// ============= Admin Event Stream =============
export function adminEventStreamHandler(req: Request, res: Response) {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  let isConnectionOpen = true;

  const send = (event: AdminEvent) => {
    if (!isConnectionOpen) return;
    try {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
      (res as Response & { flush?: () => void }).flush?.();
    } catch (err) {
      console.error('[SSE] Write error:', err);
      cleanup();
    }
  };

  const cleanup = () => {
    if (!isConnectionOpen) return;
    isConnectionOpen = false;
    clearInterval(keepAliveTimer);
    unsubscribe();
    res.end();
  };

  // Send keepalive comment every 30s to prevent proxy/browser timeouts
  const keepAliveTimer = setInterval(() => {
    if (!isConnectionOpen) return;
    try {
      res.write(':keepalive\n\n');
      (res as Response & { flush?: () => void }).flush?.();
    } catch {
      cleanup();
    }
  }, 30_000);

  getRecentAdminEvents().forEach(send);

  const unsubscribe = subscribeAdminEvents(send);

  req.on('close', cleanup);
  req.on('error', (err) => {
    console.error('[SSE] Request error:', err);
    cleanup();
  });
}

// ============= Product Promotions CRUD =============
export const listProductPromotionsHandler = asyncHandler(async (req, res) => {
  const promotions = await AdminService.listProductPromotions();
  return res.status(200).json({ promotions });
});

export const getProductPromotionHandler = asyncHandler(async (req, res) => {
  const promotionId = parseIntParam(req.params.id);
  const promotion = await AdminService.getProductPromotionById(promotionId);
  if (!promotion) throw new AppError('Promotion not found', 404);
  return res.status(200).json({ promotion });
});

export const createProductPromotionHandler = asyncHandler(async (req, res) => {
  const promotion = await AdminService.createProductPromotion(req.body);
  return res.status(201).json({ promotion });
});

export const updateProductPromotionHandler = asyncHandler(async (req, res) => {
  const promotionId = parseIntParam(req.params.id);
  const promotion = await AdminService.updateProductPromotion(promotionId, req.body);
  return res.status(200).json({ promotion });
});

export const deleteProductPromotionHandler = asyncHandler(async (req, res) => {
  const promotionId = parseIntParam(req.params.id);
  await AdminService.deleteProductPromotion(promotionId);
  return res.status(200).json({ success: true });
});

// ============= Promo Offers CRUD =============
export const listPromoOffersHandler = asyncHandler(async (_req, res) => {
  const offers = await AdminService.listPromoOffers();
  return res.status(200).json({ offers });
});

export const getPromoOfferHandler = asyncHandler(async (req, res) => {
  const offerId = parseIntParam(req.params.id);
  const offer = await AdminService.getPromoOfferById(offerId);
  if (!offer) throw new AppError('Promo offer not found', 404);
  return res.status(200).json({ offer });
});

export const createPromoOfferHandler = asyncHandler(async (req, res) => {
  const offer = await AdminService.createPromoOffer(req.body);
  publishAdminEvent('promoOffer.created', { offerId: offer.offer_id });
  return res.status(201).json({ offer });
});

export const updatePromoOfferHandler = asyncHandler(async (req, res) => {
  const offerId = parseIntParam(req.params.id);
  const offer = await AdminService.updatePromoOffer(offerId, req.body);
  publishAdminEvent('promoOffer.updated', { offerId });
  return res.status(200).json({ offer });
});

export const deletePromoOfferHandler = asyncHandler(async (req, res) => {
  const offerId = parseIntParam(req.params.id);
  await AdminService.deletePromoOffer(offerId);
  publishAdminEvent('promoOffer.deleted', { offerId });
  return res.status(200).json({ success: true });
});
