import { Router } from 'express';

import {
  listMembershipsHandler,
  purchaseMembershipHandler,
  listMembershipStatusesHandler,
  recordMembershipVisitHandler,
} from '../controllers/membership.controller';
import { supabaseAuthGuard, requireRoles } from '../middleware/supabase-auth.middleware';
import { cachePublic } from '../middleware/cache.middleware';

export const membershipRouter = Router();

membershipRouter.get('/', cachePublic(300), listMembershipsHandler);
membershipRouter.post('/purchase', supabaseAuthGuard, purchaseMembershipHandler);
membershipRouter.get(
  '/admin',
  supabaseAuthGuard,
  requireRoles('admin', 'staff'),
  listMembershipStatusesHandler,
);
membershipRouter.post(
  '/:userId/visit',
  supabaseAuthGuard,
  requireRoles('admin', 'staff'),
  recordMembershipVisitHandler,
);
