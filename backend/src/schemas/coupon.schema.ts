import { z } from 'zod';

// A coupon may target one or more purchase categories.
// 'all' means it can be applied to any purchase type.
export const COUPON_CATEGORIES = ['all', 'membership', 'ticket', 'party_booking'] as const;
export type CouponCategory = (typeof COUPON_CATEGORIES)[number];

const couponCodeSchema = z
  .string()
  .trim()
  .min(3, 'Coupon code must be at least 3 characters')
  .max(40, 'Coupon code must be at most 40 characters')
  .regex(/^[A-Za-z0-9_-]+$/, 'Coupon code may only contain letters, numbers, hyphens and underscores')
  .transform(value => value.toUpperCase());

const isoDateString = z
  .string()
  .datetime({ offset: true })
  .or(z.string().regex(/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2})?)?$/));

const baseCoupon = z
  .object({
    code: couponCodeSchema,
    description: z.string().trim().max(500).optional().nullable(),
    percent_off: z.number().min(0).max(100).optional().nullable(),
    amount_off_usd: z.number().min(0).max(10000).optional().nullable(),
    valid_from: isoDateString.optional().nullable(),
    valid_to: isoDateString.optional().nullable(),
    max_redemptions: z.number().int().min(0).optional().nullable(),
    is_active: z.boolean().optional(),
    applies_to: z.array(z.enum(COUPON_CATEGORIES)).min(1).optional(),
    min_purchase_usd: z.number().min(0).max(100000).optional().nullable(),
  })
  .refine(
    data =>
      (data.percent_off != null && data.percent_off > 0) ||
      (data.amount_off_usd != null && data.amount_off_usd > 0),
    {
      message: 'Coupon must specify either a percent_off or amount_off_usd',
      path: ['percent_off'],
    },
  )
  .refine(
    data => !(data.percent_off != null && data.percent_off > 0 && data.amount_off_usd != null && data.amount_off_usd > 0),
    {
      message: 'Coupon cannot specify both percent_off and amount_off_usd',
      path: ['amount_off_usd'],
    },
  );

export const createCouponSchema = baseCoupon;
export type CreateCouponInput = z.infer<typeof createCouponSchema>;

export const updateCouponSchema = z
  .object({
    code: couponCodeSchema.optional(),
    description: z.string().trim().max(500).optional().nullable(),
    percent_off: z.number().min(0).max(100).optional().nullable(),
    amount_off_usd: z.number().min(0).max(10000).optional().nullable(),
    valid_from: isoDateString.optional().nullable(),
    valid_to: isoDateString.optional().nullable(),
    max_redemptions: z.number().int().min(0).optional().nullable(),
    is_active: z.boolean().optional(),
    applies_to: z.array(z.enum(COUPON_CATEGORIES)).min(1).optional(),
    min_purchase_usd: z.number().min(0).max(100000).optional().nullable(),
  })
  .refine(
    data =>
      !(data.percent_off != null && data.percent_off > 0 && data.amount_off_usd != null && data.amount_off_usd > 0),
    {
      message: 'Coupon cannot specify both percent_off and amount_off_usd',
      path: ['amount_off_usd'],
    },
  );
export type UpdateCouponInput = z.infer<typeof updateCouponSchema>;

// Public validation: accept the cart contents so we can preview the discount.
const cartItemSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('ticket'),
    unitPrice: z.number().min(0),
    quantity: z.number().int().min(1),
  }),
  z.object({
    type: z.literal('membership'),
    unitPrice: z.number().min(0),
  }),
  z.object({
    type: z.literal('booking'),
    unitPrice: z.number().min(0),
  }),
]);

export const validateCouponSchema = z.object({
  code: couponCodeSchema,
  items: z.array(cartItemSchema).min(1, 'Cart is empty'),
});
export type ValidateCouponInput = z.infer<typeof validateCouponSchema>;
