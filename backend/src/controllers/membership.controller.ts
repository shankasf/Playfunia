import type { Request, Response } from 'express';
import { ZodError } from 'zod';

import type { AuthenticatedRequest } from '../middleware/auth.middleware';
import {
  listMemberships,
  purchaseMembership,
  listMembershipStatuses,
  recordMembershipVisit,
} from '../services/membership.service';
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
    benefits: membership.benefits,
    maxChildren: membership.maxChildren,
    visitsPerMonth: membership.visitsPerMonth,
    discountPercent: membership.discountPercent,
    guestPassesPerMonth: membership.guestPassesPerMonth,
  }));

  return res.status(200).json({ memberships: formatted });
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
