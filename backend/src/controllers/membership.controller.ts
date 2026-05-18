import type { Request, Response } from 'express';
import { ZodError } from 'zod';

import type { SupabaseAuthenticatedRequest as AuthenticatedRequest } from '../middleware/supabase-auth.middleware';
import {
  listMemberships,
  purchaseMembership,
  listMembershipStatuses,
  recordMembershipVisit,
  listPromoOffers,
  getMembershipDetails,
  lookupMembershipForCheckIn,
} from '../services/membership.service';
import { uploadChildPhoto } from '../services/child-photo.service';
import { MembershipRepository, ChildRepository, UserRepository } from '../repositories';
import {
  purchaseMembershipSchema,
  membershipUserParamSchema,
  recordMembershipVisitSchema,
} from '../schemas/membership.schema';
import { AppError } from '../utils/app-error';
import { asyncHandler } from '../utils/async-handler';

export const listMembershipsHandler = asyncHandler(async (_req: Request, res: Response) => {
  const memberships = await listMemberships();
  const formatted = memberships.map(membership => ({
    id: membership.id,
    name: membership.name,
    description: membership.description,
    monthlyPrice: membership.monthlyPrice,
    originalPrice: membership.originalPrice,
    promoLabel: membership.promoLabel,
    promoNote: membership.promoNote,
    promoEndsAt: membership.promoEndsAt,
    promoSpotsLeft: membership.promoSpotsLeft,
    benefits: membership.benefits,
    maxChildren: membership.maxChildren,
    maxAdults: membership.maxAdults,
    visitsPerMonth: membership.visitsPerMonth,
    discountPercent: membership.discountPercent,
    guestPassesPerMonth: membership.guestPassesPerMonth,
  }));

  return res.status(200).json({ memberships: formatted });
});

export const listPromoOffersHandler = asyncHandler(async (_req: Request, res: Response) => {
  const offers = await listPromoOffers();
  return res.status(200).json({ offers });
});

export const purchaseMembershipHandler = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    if (!req.user) {
      throw new AppError('Unauthorized', 401);
    }

    const payload = parseWithSchema(purchaseMembershipSchema, req.body);
    const membership = await purchaseMembership(req.user.id, payload);

    return res.status(200).json({ membership });
  },
);

export const listMembershipStatusesHandler = asyncHandler(
  async (_req: AuthenticatedRequest, res: Response) => {
    const memberships = await listMembershipStatuses();
    return res.status(200).json({ memberships });
  },
);

export const recordMembershipVisitHandler = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const { userId } = parseWithSchema(membershipUserParamSchema, req.params);
    const payload = parseWithSchema(recordMembershipVisitSchema, req.body ?? {});
    const result = await recordMembershipVisit(userId, payload);
    return res.status(200).json(result);
  },
);

/**
 * Get the authenticated user's own membership details
 */
export const getMyMembershipHandler = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    if (!req.user) {
      throw new AppError('Unauthorized', 401);
    }

    const details = await getMembershipDetails(req.user.id);
    return res.status(200).json({ membership: details });
  },
);

/**
 * Toggle auto-renew for the authenticated user's membership
 */
export const toggleAutoRenewHandler = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    if (!req.user) {
      throw new AppError('Unauthorized', 401);
    }

    const { autoRenew } = req.body;
    if (typeof autoRenew !== 'boolean') {
      throw new AppError('autoRenew must be a boolean', 400);
    }

    const details = await getMembershipDetails(req.user.id);
    if (!details) {
      throw new AppError('No active membership found', 404);
    }

    const membershipIdNum = parseInt(details.membershipId, 10);
    await MembershipRepository.update(membershipIdNum, { auto_renew: autoRenew });

    return res.status(200).json({ success: true, autoRenew });
  },
);

/**
 * Upload a photo for a child (used during membership purchase)
 */
export const uploadChildPhotoHandler = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    if (!req.user) {
      throw new AppError('Unauthorized', 401);
    }

    const childId = parseInt(req.params.childId ?? '', 10);
    if (isNaN(childId)) {
      throw new AppError('Invalid child ID', 400);
    }

    // Verify the child belongs to this user's customer
    const userIdNum = parseInt(req.user.id, 10);
    const user = await UserRepository.findById(userIdNum);
    if (!user?.customer_id) {
      throw new AppError('No customer record found', 400);
    }

    const child = await ChildRepository.findById(childId);
    if (!child || child.customer_id !== user.customer_id) {
      throw new AppError('Child not found or does not belong to this user', 403);
    }

    const file = req.file as Express.Multer.File | undefined;
    if (!file) {
      throw new AppError('No file uploaded', 400);
    }

    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)) {
      throw new AppError('Only JPG, PNG, and WebP images are allowed', 400);
    }

    if (file.size > 10 * 1024 * 1024) {
      throw new AppError('File size must be under 10MB', 400);
    }

    const photoUrl = await uploadChildPhoto(childId, file);

    return res.status(200).json({ success: true, photoUrl });
  },
);

/**
 * Staff verification: look up an active membership by its display ID and return
 * the customer + child records (with photos) so the front desk can confirm
 * identity at check-in.
 */
export const staffMembershipLookupHandler = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const displayId = String(req.params.displayId ?? '').trim();
    if (!displayId) {
      throw new AppError('Membership display ID is required', 400);
    }
    const result = await lookupMembershipForCheckIn(displayId);
    return res.status(200).json({ membership: result });
  },
);

function parseWithSchema<T>(schema: { parse: (data: unknown) => T }, data: unknown): T {
  try {
    return schema.parse(data);
  } catch (error) {
    if (error instanceof ZodError) {
      const message = error.issues.map(issue => issue.message).join(', ');
      throw new AppError(`Validation failed: ${message}`, 400, { cause: error });
    }
    throw error;
  }
}
