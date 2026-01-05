import { z } from 'zod';

export const checkoutItemSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('ticket'),
    label: z.string().min(1),
    quantity: z.number().int().min(1),
    unitPrice: z.number().positive(),
    metadata: z.record(z.string(), z.any()).optional(),
  }),
  z.object({
    type: z.literal('membership'),
    label: z.string().min(1),
    membershipId: z.string().min(1),
    durationMonths: z.number().int().positive().max(24),
    autoRenew: z.boolean().optional(),
    unitPrice: z.number().positive(),
  }),
]);

export type CheckoutItemInput = z.infer<typeof checkoutItemSchema>;

export const checkoutIntentSchema = z.object({
  items: z.array(checkoutItemSchema).min(1),
  promoCode: z
    .string()
    .trim()
    .max(40)
    .transform(value => value.toUpperCase())
    .optional(),
});

export type CheckoutIntentInput = z.infer<typeof checkoutIntentSchema>;

export const checkoutFinalizeSchema = z.object({
  paymentIntentId: z.string().min(1),
  items: z.array(checkoutItemSchema).min(1),
  promoCode: z
    .string()
    .trim()
    .max(40)
    .transform(value => value.toUpperCase())
    .optional(),
});

export type CheckoutFinalizeInput = z.infer<typeof checkoutFinalizeSchema>;

export const guestCheckoutIntentSchema = z.object({
  guestFirstName: z.string().min(1).max(100),
  guestLastName: z.string().min(1).max(100),
  guestEmail: z.string().email(),
  guestPhone: z.string().min(10).max(20),
  items: z.array(checkoutItemSchema).min(1),
  promoCode: z
    .string()
    .trim()
    .max(40)
    .transform(value => value.toUpperCase())
    .optional(),
});

export type GuestCheckoutIntentInput = z.infer<typeof guestCheckoutIntentSchema>;

export const guestCheckoutFinalizeSchema = z.object({
  paymentIntentId: z.string().min(1),
  guestFirstName: z.string().min(1).max(100),
  guestLastName: z.string().min(1).max(100),
  guestEmail: z.string().email(),
  guestPhone: z.string().min(10).max(20),
  items: z.array(checkoutItemSchema).min(1),
  promoCode: z
    .string()
    .trim()
    .max(40)
    .transform(value => value.toUpperCase())
    .optional(),
});

export type GuestCheckoutFinalizeInput = z.infer<typeof guestCheckoutFinalizeSchema>;
