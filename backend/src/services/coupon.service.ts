import { PromotionRepository } from '../repositories';
import { AppError } from '../utils/app-error';
import { centsToDollars, dollarsToCents } from '../utils/currency';
import type { CouponCategory } from '../schemas/coupon.schema';

export interface CouponCartItem {
  type: 'ticket' | 'membership' | 'booking';
  unitPrice: number;
  quantity?: number;
}

export interface CouponEvaluation {
  promotionId: number;
  code: string;
  description: string | null;
  appliesTo: CouponCategory[];
  percentOff: number | null;
  amountOffUsd: number | null;
  // Subtotal restricted to items the coupon applies to (i.e. eligible portion of cart).
  eligibleSubtotal: number;
  // Final discount in dollars (rounded to cents) applied against the eligible subtotal.
  discountAmount: number;
  label: string;
}

const ROUND = (value: number) => centsToDollars(dollarsToCents(value));

function asCategoryList(applies_to: string[] | null | undefined): CouponCategory[] {
  if (!applies_to || applies_to.length === 0) return ['all'];
  const valid = ['all', 'membership', 'ticket', 'party_booking'] as const;
  return applies_to.filter((c): c is CouponCategory => (valid as readonly string[]).includes(c));
}

// Cart-item types are internal ('booking' = a party booking item in the cart)
// while coupon categories are admin-facing ('party_booking'). Map between them here.
function itemCategory(type: CouponCartItem['type']): CouponCategory {
  return type === 'booking' ? 'party_booking' : type;
}

function lineTotal(item: CouponCartItem): number {
  if (item.type === 'ticket') return ROUND(item.unitPrice * (item.quantity ?? 1));
  return ROUND(item.unitPrice);
}

/**
 * Compute the subtotal of cart items that match the coupon's category restriction.
 */
export function eligibleSubtotal(items: CouponCartItem[], appliesTo: CouponCategory[]): number {
  if (appliesTo.includes('all')) {
    return ROUND(items.reduce((sum, item) => sum + lineTotal(item), 0));
  }
  return ROUND(
    items
      .filter(item => appliesTo.includes(itemCategory(item.type)))
      .reduce((sum, item) => sum + lineTotal(item), 0),
  );
}

/**
 * Look up and validate a coupon for the given cart. Throws AppError with a user-friendly
 * message when invalid (expired, capped, wrong category, below minimum, etc.).
 */
export async function evaluateCoupon(code: string, items: CouponCartItem[]): Promise<CouponEvaluation> {
  const cleanCode = code.trim().toUpperCase();
  if (!cleanCode) {
    throw new AppError('Coupon code is required', 400);
  }

  const promo = await PromotionRepository.findByCode(cleanCode);
  if (!promo) {
    throw new AppError('Coupon code is not valid', 404);
  }

  const now = new Date();
  if (promo.valid_from && new Date(promo.valid_from) > now) {
    throw new AppError('This coupon is not active yet', 400);
  }
  if (promo.valid_to && new Date(promo.valid_to) < now) {
    throw new AppError('This coupon has expired', 400);
  }
  if (promo.max_redemptions != null && (promo.redemptions ?? 0) >= promo.max_redemptions) {
    throw new AppError('This coupon has reached its redemption limit', 400);
  }

  const appliesTo = asCategoryList(promo.applies_to);
  const subtotal = eligibleSubtotal(items, appliesTo);

  if (subtotal <= 0) {
    const niceList = appliesTo.includes('all') ? 'this purchase' : appliesTo.join(', ');
    throw new AppError(`This coupon only applies to ${niceList}`, 400);
  }

  if (promo.min_purchase_usd != null && subtotal < promo.min_purchase_usd) {
    throw new AppError(
      `This coupon requires a minimum eligible subtotal of $${Number(promo.min_purchase_usd).toFixed(2)}`,
      400,
    );
  }

  let discountAmount = 0;
  if (promo.percent_off && promo.percent_off > 0) {
    discountAmount = ROUND(subtotal * (Number(promo.percent_off) / 100));
  } else if (promo.amount_off_usd && promo.amount_off_usd > 0) {
    discountAmount = ROUND(Math.min(Number(promo.amount_off_usd), subtotal));
  }

  if (discountAmount <= 0) {
    throw new AppError('This coupon has no value configured', 400);
  }

  const label = promo.percent_off
    ? `Coupon ${cleanCode} (${Number(promo.percent_off)}% off)`
    : `Coupon ${cleanCode} ($${Number(promo.amount_off_usd ?? 0).toFixed(2)} off)`;

  return {
    promotionId: promo.promotion_id,
    code: cleanCode,
    description: promo.description ?? null,
    appliesTo,
    percentOff: promo.percent_off != null ? Number(promo.percent_off) : null,
    amountOffUsd: promo.amount_off_usd != null ? Number(promo.amount_off_usd) : null,
    eligibleSubtotal: subtotal,
    discountAmount,
    label,
  };
}

/**
 * Best-effort coupon lookup that swallows errors. Returns null if the coupon is
 * invalid for any reason (expired, capped, wrong category, etc.). Used by checkout
 * so an invalid code does not abort the whole order.
 */
export async function tryEvaluateCoupon(
  code: string | undefined | null,
  items: CouponCartItem[],
): Promise<CouponEvaluation | null> {
  if (!code) return null;
  try {
    return await evaluateCoupon(code, items);
  } catch {
    return null;
  }
}
