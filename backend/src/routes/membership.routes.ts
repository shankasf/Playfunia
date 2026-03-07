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
// SECURITY: Direct purchase endpoint restricted to admin/staff only
// Regular users must use checkout flow which validates payment
membershipRouter.post('/purchase', supabaseAuthGuard, requireRoles('admin', 'staff'), purchaseMembershipHandler);
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
