import { Router } from 'express';

import multer from 'multer';

import {
  listMembershipsHandler,
  listPromoOffersHandler,
  purchaseMembershipHandler,
  listMembershipStatusesHandler,
  recordMembershipVisitHandler,
  getMyMembershipHandler,
  toggleAutoRenewHandler,
  uploadChildPhotoHandler,
  staffMembershipLookupHandler,
} from '../controllers/membership.controller';
import { supabaseAuthGuard, requireRoles } from '../middleware/supabase-auth.middleware';
import { cachePublic } from '../middleware/cache.middleware';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

export const membershipRouter = Router();

membershipRouter.get('/', cachePublic(300), listMembershipsHandler);
membershipRouter.get('/promo-offers', cachePublic(300), listPromoOffersHandler);

// User-facing: get own membership details (requires auth)
membershipRouter.get('/my', supabaseAuthGuard, getMyMembershipHandler);

// User-facing: toggle auto-renew
membershipRouter.patch('/my/auto-renew', supabaseAuthGuard, toggleAutoRenewHandler);

// User-facing: upload child photo (for membership verification)
membershipRouter.post('/child-photo/:childId', supabaseAuthGuard, upload.single('photo'), uploadChildPhotoHandler);

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

// Staff verification: look up a membership by display ID and view child photos for check-in.
membershipRouter.get(
  '/staff/lookup/:displayId',
  supabaseAuthGuard,
  requireRoles('admin', 'staff'),
  staffMembershipLookupHandler,
);
