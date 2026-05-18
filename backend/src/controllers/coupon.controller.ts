import type { NextFunction, Request, Response } from 'express';

import { PromotionRepository } from '../repositories';
import { AppError } from '../utils/app-error';
import { logger } from '../utils/logger';
import {
  createCouponSchema,
  updateCouponSchema,
  validateCouponSchema,
  COUPON_CATEGORIES,
} from '../schemas/coupon.schema';
import { evaluateCoupon } from '../services/coupon.service';

function serialize(promo: Record<string, any>) {
  return {
    promotion_id: promo.promotion_id,
    code: promo.code,
    description: promo.description ?? null,
    percent_off: promo.percent_off != null ? Number(promo.percent_off) : null,
    amount_off_usd: promo.amount_off_usd != null ? Number(promo.amount_off_usd) : null,
    valid_from: promo.valid_from ?? null,
    valid_to: promo.valid_to ?? null,
    max_redemptions: promo.max_redemptions ?? null,
    redemptions: promo.redemptions ?? 0,
    is_active: promo.is_active ?? true,
    applies_to: Array.isArray(promo.applies_to) && promo.applies_to.length > 0 ? promo.applies_to : ['all'],
    min_purchase_usd: promo.min_purchase_usd != null ? Number(promo.min_purchase_usd) : null,
    created_at: promo.created_at ?? null,
  };
}

export async function listCouponsHandler(_req: Request, res: Response, next: NextFunction) {
  try {
    const data = await PromotionRepository.findAll(false);
    res.json({ coupons: data.map(serialize), categories: COUPON_CATEGORIES });
  } catch (err) {
    next(err);
  }
}

export async function getCouponHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const id = parseInt(req.params.id ?? '', 10);
    if (isNaN(id)) throw new AppError('Invalid coupon id', 400);
    const promo = await PromotionRepository.findById(id);
    if (!promo) throw new AppError('Coupon not found', 404);
    res.json({ coupon: serialize(promo) });
  } catch (err) {
    next(err);
  }
}

export async function createCouponHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = createCouponSchema.parse(req.body);
    const existing = await PromotionRepository.findByCode(parsed.code);
    if (existing) throw new AppError('A coupon with this code already exists', 409);
    const created = await PromotionRepository.create({
      code: parsed.code,
      description: parsed.description ?? null,
      percent_off: parsed.percent_off ?? null,
      amount_off_usd: parsed.amount_off_usd ?? null,
      valid_from: parsed.valid_from ?? null,
      valid_to: parsed.valid_to ?? null,
      max_redemptions: parsed.max_redemptions ?? null,
      is_active: parsed.is_active ?? true,
      applies_to: parsed.applies_to ?? ['all'],
      min_purchase_usd: parsed.min_purchase_usd ?? null,
    });
    res.status(201).json({ coupon: serialize(created) });
  } catch (err) {
    next(err);
  }
}

export async function updateCouponHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const id = parseInt(req.params.id ?? '', 10);
    if (isNaN(id)) throw new AppError('Invalid coupon id', 400);
    const parsed = updateCouponSchema.parse(req.body);
    const updated = await PromotionRepository.update(id, parsed);
    if (!updated) throw new AppError('Coupon not found', 404);
    res.json({ coupon: serialize(updated) });
  } catch (err) {
    next(err);
  }
}

export async function deleteCouponHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const id = parseInt(req.params.id ?? '', 10);
    if (isNaN(id)) throw new AppError('Invalid coupon id', 400);
    await PromotionRepository.delete(id);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
}

/**
 * Public endpoint: validate a coupon against the current cart and preview the discount.
 * No authentication required so guest checkout can use it.
 */
export async function validateCouponHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = validateCouponSchema.parse(req.body);
    const evaluation = await evaluateCoupon(parsed.code, parsed.items);
    res.json({
      valid: true,
      code: evaluation.code,
      description: evaluation.description,
      appliesTo: evaluation.appliesTo,
      percentOff: evaluation.percentOff,
      amountOffUsd: evaluation.amountOffUsd,
      eligibleSubtotal: evaluation.eligibleSubtotal,
      discountAmount: evaluation.discountAmount,
      label: evaluation.label,
    });
  } catch (err) {
    if (err instanceof AppError) {
      return res.status(err.statusCode).json({ valid: false, message: err.message });
    }
    logger.error({ err }, 'Coupon validation failed');
    next(err);
  }
}
