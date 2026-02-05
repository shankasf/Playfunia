import { Router, type NextFunction, type Request, type Response } from 'express';
import jwt from 'jsonwebtoken';

import { appConfig } from '../config/env';
import { supabaseAuthGuard, requireRoles, ROLES, type SupabaseAuthenticatedRequest } from '../middleware/supabase-auth.middleware';
import { UserRepository } from '../repositories';
import { recalculateBookingPricingHandler } from '../controllers/booking.controller';
import { runReconciliation, isReconciliationRunning, isSchedulerActive } from '../services/event-reconciliation.service';
import {
  // Dashboard
  getAdminSummaryHandler,
  adminEventStreamHandler,

  // Roles
  listRolesHandler,

  // Users
  listUsersHandler,
  getUserHandler,
  updateUserHandler,
  deleteUserHandler,
  
  // Customers
  listCustomersHandler,
  getCustomerHandler,
  updateCustomerHandler,
  deleteCustomerHandler,
  
  // Children
  listChildrenHandler,
  getChildHandler,
  createChildHandler,
  updateChildHandler,
  deleteChildHandler,
  
  // Events
  listEventsHandler,
  getEventHandler,
  createEventHandler,
  updateEventHandler,
  deleteEventHandler,
  
  // Membership Plans
  listMembershipPlansHandler,
  getMembershipPlanHandler,
  createMembershipPlanHandler,
  updateMembershipPlanHandler,
  deleteMembershipPlanHandler,
  
  // Memberships
  listMembershipsHandler,
  getMembershipHandler,
  createMembershipHandler,
  updateMembershipHandler,
  deleteMembershipHandler,
  validateMembershipHandler,
  recordMembershipVisitHandler,
  
  // Party Packages
  listPartyPackagesHandler,
  getPartyPackageHandler,
  createPartyPackageHandler,
  updatePartyPackageHandler,
  deletePartyPackageHandler,
  
  // Bookings
  listBookingsHandler,
  getBookingHandler,
  updateBookingHandler,
  cancelBookingHandler,
  deleteBookingHandler,

  // Waiver Users
  listWaiverUsersHandler,
  getWaiverUserHandler,
  updateWaiverUserHandler,
  deleteWaiverUserHandler,
  
  // Waiver Submissions
  listWaiverSubmissionsHandler,
  getWaiverSubmissionHandler,
  updateWaiverSubmissionHandler,
  deleteWaiverSubmissionHandler,
  
  // Ticket Purchases
  listTicketPurchasesHandler,
  getTicketPurchaseHandler,
  updateTicketPurchaseHandler,
  redeemTicketCodeHandler,
  validateTicketCodeHandler,
  lookupTicketByCodeHandler,
  redeemTicketByCodeHandler,
  deleteTicketPurchaseHandler,

  // App Payments
  listAppPaymentsHandler,
  getAppPaymentHandler,
  updateAppPaymentHandler,
  
  // FAQs
  listFAQsHandler,
  getFAQHandler,
  createFAQHandler,
  updateFAQHandler,
  deleteFAQHandler,
  
  // Testimonials
  listTestimonialsHandler,
  getTestimonialHandler,
  createTestimonialHandler,
  updateTestimonialHandler,
  deleteTestimonialHandler,
  
  // Announcements
  listAnnouncementsHandler,
  getAnnouncementHandler,
  createAnnouncementHandler,
  updateAnnouncementHandler,
  deleteAnnouncementHandler,
  
  // Ticket Types
  listTicketTypesHandler,
  getTicketTypeHandler,
  createTicketTypeHandler,
  updateTicketTypeHandler,
  deleteTicketTypeHandler,
  
  // Locations
  listLocationsHandler,
  getLocationHandler,
  createLocationHandler,
  updateLocationHandler,
  deleteLocationHandler,
  
  // Resources
  listResourcesHandler,
  getResourceHandler,
  createResourceHandler,
  updateResourceHandler,
  deleteResourceHandler,
  
  // Exports
  exportWaiversHandler,
  exportContactsHandler,
} from '../controllers/admin.controller';
import { AppError } from '../utils/app-error';

export const adminRouter = Router();

// ============= Public routes with token query param =============
adminRouter.get('/stream', adminStreamGuard, adminEventStreamHandler);
adminRouter.get('/waivers/export', adminQueryTokenGuard, exportWaiversHandler);
adminRouter.get('/contacts/export', adminQueryTokenGuard, exportContactsHandler);

// ============= Protected admin routes =============
// Both admin and employee roles can access the admin dashboard
adminRouter.use(supabaseAuthGuard, requireRoles(ROLES.ADMIN, ROLES.EMPLOYEE));

// Dashboard
adminRouter.get('/summary', getAdminSummaryHandler);

// Roles (for user management dropdown)
adminRouter.get('/roles', listRolesHandler);

// Users CRUD
adminRouter.get('/users', listUsersHandler);
adminRouter.get('/users/:id', getUserHandler);
adminRouter.patch('/users/:id', updateUserHandler);
adminRouter.delete('/users/:id', deleteUserHandler);

// Customers CRUD
adminRouter.get('/customers', listCustomersHandler);
adminRouter.get('/customers/:id', getCustomerHandler);
adminRouter.patch('/customers/:id', updateCustomerHandler);
adminRouter.delete('/customers/:id', deleteCustomerHandler);

// Children CRUD
adminRouter.get('/children', listChildrenHandler);
adminRouter.get('/children/:id', getChildHandler);
adminRouter.post('/children', createChildHandler);
adminRouter.patch('/children/:id', updateChildHandler);
adminRouter.delete('/children/:id', deleteChildHandler);

// Events CRUD
adminRouter.get('/events', listEventsHandler);
adminRouter.get('/events/:id', getEventHandler);
adminRouter.post('/events', createEventHandler);
adminRouter.patch('/events/:id', updateEventHandler);
adminRouter.delete('/events/:id', deleteEventHandler);

// Membership Plans CRUD
adminRouter.get('/membership-plans', listMembershipPlansHandler);
adminRouter.get('/membership-plans/:id', getMembershipPlanHandler);
adminRouter.post('/membership-plans', createMembershipPlanHandler);
adminRouter.patch('/membership-plans/:id', updateMembershipPlanHandler);
adminRouter.delete('/membership-plans/:id', deleteMembershipPlanHandler);

// Customer Memberships CRUD
adminRouter.get('/memberships', listMembershipsHandler);
adminRouter.get('/memberships/:id', getMembershipHandler);
adminRouter.post('/memberships', createMembershipHandler);
adminRouter.patch('/memberships/:id', updateMembershipHandler);
adminRouter.delete('/memberships/:id', deleteMembershipHandler);
adminRouter.post('/memberships/validate', validateMembershipHandler);
adminRouter.post('/memberships/:membershipId/visit', recordMembershipVisitHandler);

// Party Packages CRUD
adminRouter.get('/party-packages', listPartyPackagesHandler);
adminRouter.get('/party-packages/:id', getPartyPackageHandler);
adminRouter.post('/party-packages', createPartyPackageHandler);
adminRouter.patch('/party-packages/:id', updatePartyPackageHandler);
adminRouter.delete('/party-packages/:id', deletePartyPackageHandler);

// Bookings CRUD
adminRouter.get('/bookings', listBookingsHandler);
adminRouter.get('/bookings/:id', getBookingHandler);
adminRouter.patch('/bookings/:id', updateBookingHandler);
adminRouter.post('/bookings/:id/cancel', cancelBookingHandler);
adminRouter.delete('/bookings/:id', deleteBookingHandler);
adminRouter.post('/bookings/:id/recalculate-pricing', recalculateBookingPricingHandler);

// Waiver Users CRUD
adminRouter.get('/waiver-users', listWaiverUsersHandler);
adminRouter.get('/waiver-users/:id', getWaiverUserHandler);
adminRouter.patch('/waiver-users/:id', updateWaiverUserHandler);
adminRouter.delete('/waiver-users/:id', deleteWaiverUserHandler);

// Waiver Submissions
adminRouter.get('/waiver-submissions', listWaiverSubmissionsHandler);
adminRouter.get('/waiver-submissions/:id', getWaiverSubmissionHandler);
adminRouter.patch('/waiver-submissions/:id', updateWaiverSubmissionHandler);
adminRouter.delete('/waiver-submissions/:id', deleteWaiverSubmissionHandler);

// Waivers (alias for frontend compatibility)
adminRouter.get('/waivers', listWaiverSubmissionsHandler);
adminRouter.patch('/waivers/:id', updateWaiverSubmissionHandler);
adminRouter.delete('/waivers/:id', deleteWaiverSubmissionHandler);

// Ticket Purchases
adminRouter.get('/ticket-purchases', listTicketPurchasesHandler);
adminRouter.get('/ticket-purchases/:id', getTicketPurchaseHandler);
adminRouter.patch('/ticket-purchases/:id', updateTicketPurchaseHandler);
adminRouter.post('/tickets/redeem', redeemTicketCodeHandler);

// Ticket Code Operations (new endpoints for code-based lookup/redemption)
adminRouter.post('/tickets/validate', validateTicketCodeHandler);
adminRouter.get('/tickets/lookup/:code', lookupTicketByCodeHandler);
adminRouter.post('/tickets/redeem-code', redeemTicketByCodeHandler);

// Tickets log (alias for frontend compatibility)
adminRouter.get('/tickets/log', listTicketPurchasesHandler);
adminRouter.delete('/tickets/:id', deleteTicketPurchaseHandler);

// App Payments
adminRouter.get('/payments', listAppPaymentsHandler);
adminRouter.get('/payments/:id', getAppPaymentHandler);
adminRouter.patch('/payments/:id', updateAppPaymentHandler);

// FAQs CRUD
adminRouter.get('/faqs', listFAQsHandler);
adminRouter.get('/faqs/:id', getFAQHandler);
adminRouter.post('/faqs', createFAQHandler);
adminRouter.patch('/faqs/:id', updateFAQHandler);
adminRouter.delete('/faqs/:id', deleteFAQHandler);

// Testimonials CRUD
adminRouter.get('/testimonials', listTestimonialsHandler);
adminRouter.get('/testimonials/:id', getTestimonialHandler);
adminRouter.post('/testimonials', createTestimonialHandler);
adminRouter.patch('/testimonials/:id', updateTestimonialHandler);
adminRouter.delete('/testimonials/:id', deleteTestimonialHandler);

// Announcements CRUD
adminRouter.get('/announcements', listAnnouncementsHandler);
adminRouter.get('/announcements/:id', getAnnouncementHandler);
adminRouter.post('/announcements', createAnnouncementHandler);
adminRouter.patch('/announcements/:id', updateAnnouncementHandler);
adminRouter.delete('/announcements/:id', deleteAnnouncementHandler);

// Ticket Types CRUD
adminRouter.get('/ticket-types', listTicketTypesHandler);
adminRouter.get('/ticket-types/:id', getTicketTypeHandler);
adminRouter.post('/ticket-types', createTicketTypeHandler);
adminRouter.patch('/ticket-types/:id', updateTicketTypeHandler);
adminRouter.delete('/ticket-types/:id', deleteTicketTypeHandler);

// Locations CRUD
adminRouter.get('/locations', listLocationsHandler);
adminRouter.get('/locations/:id', getLocationHandler);
adminRouter.post('/locations', createLocationHandler);
adminRouter.patch('/locations/:id', updateLocationHandler);
adminRouter.delete('/locations/:id', deleteLocationHandler);

// Resources CRUD
adminRouter.get('/resources', listResourcesHandler);
adminRouter.get('/resources/:id', getResourceHandler);
adminRouter.post('/resources', createResourceHandler);
adminRouter.patch('/resources/:id', updateResourceHandler);
adminRouter.delete('/resources/:id', deleteResourceHandler);

// Event Reconciliation (admin only)
// POST /api/admin/reconciliation/run?hours=24
adminRouter.post('/reconciliation/run', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const hours = parseInt(req.query.hours as string, 10) || 24;

    // Validate hours (max 672 = 28 days, Square's limit)
    if (hours < 1 || hours > 672) {
      return res.status(400).json({
        success: false,
        error: 'hours must be between 1 and 672 (28 days)',
      });
    }

    if (isReconciliationRunning()) {
      return res.status(409).json({
        success: false,
        error: 'Reconciliation is already in progress',
      });
    }

    const result = await runReconciliation(hours);

    return res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/admin/reconciliation/status
adminRouter.get('/reconciliation/status', (_req: Request, res: Response) => {
  res.json({
    success: true,
    data: {
      isRunning: isReconciliationRunning(),
      schedulerActive: isSchedulerActive(),
    },
  });
});

// ============= Guards =============
interface SupabaseJWTPayload {
  sub: string;
  email?: string;
  role: string;
  exp: number;
}

async function adminQueryTokenGuard(req: Request, _res: Response, next: NextFunction) {
  const tokenFromQuery = typeof req.query.token === 'string' ? req.query.token : undefined;
  const header = req.headers.authorization?.startsWith('Bearer ')
    ? req.headers.authorization.replace('Bearer ', '').trim()
    : undefined;
  const token = header ?? tokenFromQuery;
  if (!token) {
    return next(new AppError('Unauthorized', 401));
  }

  try {
    const jwtSecret = appConfig.supabaseJwtSecret;
    if (!jwtSecret) {
      console.error('SUPABASE_JWT_SECRET not configured');
      return next(new AppError('Authentication not configured', 500));
    }

    const payload = jwt.verify(token, jwtSecret, {
      algorithms: ['HS256'],
    }) as SupabaseJWTPayload;

    if (payload.role !== 'authenticated') {
      return next(new AppError('Invalid authentication', 401));
    }

    // Look up user in database to get roles
    const user = await UserRepository.findByAuthUserId(payload.sub);
    if (!user) {
      return next(new AppError('User not found', 401));
    }

    const roles = user.roles ?? [];
    if (!roles.some((role: string) => role === ROLES.ADMIN || role === ROLES.EMPLOYEE)) {
      return next(new AppError('Forbidden', 403));
    }

    (req as SupabaseAuthenticatedRequest).user = {
      id: String(user.user_id),
      authUserId: payload.sub,
      email: user.email,
      roles,
    };

    return next();
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      return next(new AppError('Token expired', 401));
    }
    if (error instanceof jwt.JsonWebTokenError) {
      return next(new AppError('Invalid token', 401));
    }
    return next(new AppError('Invalid or expired token', 401, { cause: error }));
  }
}

async function adminStreamGuard(req: Request, _res: Response, next: NextFunction) {
  const tokenFromQuery = typeof req.query.token === 'string' ? req.query.token : undefined;
  const header = req.headers.authorization?.startsWith('Bearer ')
    ? req.headers.authorization.replace('Bearer ', '').trim()
    : undefined;
  const token = header ?? tokenFromQuery;
  if (!token) {
    return next(new AppError('Unauthorized', 401));
  }

  try {
    const jwtSecret = appConfig.supabaseJwtSecret;
    if (!jwtSecret) {
      console.error('SUPABASE_JWT_SECRET not configured');
      return next(new AppError('Authentication not configured', 500));
    }

    const payload = jwt.verify(token, jwtSecret, {
      algorithms: ['HS256'],
    }) as SupabaseJWTPayload;

    if (payload.role !== 'authenticated') {
      return next(new AppError('Invalid authentication', 401));
    }

    // Look up user in database to get roles
    const user = await UserRepository.findByAuthUserId(payload.sub);
    if (!user) {
      return next(new AppError('User not found', 401));
    }

    const roles = user.roles ?? [];
    if (!roles.some((role: string) => role === ROLES.ADMIN || role === ROLES.EMPLOYEE)) {
      return next(new AppError('Forbidden', 403));
    }

    (req as SupabaseAuthenticatedRequest).user = {
      id: String(user.user_id),
      authUserId: payload.sub,
      email: user.email,
      roles,
    };

    return next();
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      return next(new AppError('Token expired', 401));
    }
    if (error instanceof jwt.JsonWebTokenError) {
      return next(new AppError('Invalid token', 401));
    }
    return next(new AppError('Invalid or expired token', 401, { cause: error }));
  }
}
