import { Router } from 'express';

import { validateCouponHandler } from '../controllers/coupon.controller';

export const couponRouter = Router();

// Public: validate a coupon code against the current cart contents.
// Returns { valid, code, label, discountAmount, ... } on success, or { valid: false, message }.
couponRouter.post('/validate', validateCouponHandler);
