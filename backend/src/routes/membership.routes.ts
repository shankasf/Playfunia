import { Router } from 'express';

import {
  listMembershipsHandler,
  purchaseMembershipHandler,
  listMembershipStatusesHandler,
  recordMembershipVisitHandler,
} from '../controllers/membership.controller';
import { authGuard, requireRoles } from '../middleware/auth.middleware';
import { cachePublic } from '../middleware/cache.middleware';

export const membershipRouter = Router();

membershipRouter.get('/', cachePublic(300), listMembershipsHandler);
membershipRouter.post('/purchase', authGuard, purchaseMembershipHandler);
membershipRouter.get(
  '/admin',
  authGuard,
  requireRoles('admin', 'staff'),
  listMembershipStatusesHandler,
);
membershipRouter.post(
  '/:userId/visit',
  authGuard,
  requireRoles('admin', 'staff'),
  recordMembershipVisitHandler,
);
