import { z } from 'zod';

export const squareCheckoutItemSchema = z.discriminatedUnion('type', [
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

export type SquareCheckoutItemInput = z.infer<typeof squareCheckoutItemSchema>;

// Square checkout intent - prepares the order summary (no payment token yet)
export const squareCheckoutIntentSchema = z.object({
  items: z.array(squareCheckoutItemSchema).min(1),
  promoCode: z
    .string()
    .trim()
    .max(40)
    .transform(value => value.toUpperCase())
    .optional(),
});

export type SquareCheckoutIntentInput = z.infer<typeof squareCheckoutIntentSchema>;

// Square checkout finalize - includes the payment token from Web Payments SDK
export const squareCheckoutFinalizeSchema = z.object({
  sourceId: z.string().min(1), // Payment token from Square Web Payments SDK
  verificationToken: z.string().optional(), // SCA verification token if required
  items: z.array(squareCheckoutItemSchema).min(1),
  promoCode: z
    .string()
    .trim()
    .max(40)
    .transform(value => value.toUpperCase())
    .optional(),
});

export type SquareCheckoutFinalizeInput = z.infer<typeof squareCheckoutFinalizeSchema>;

// Guest checkout schemas
export const squareGuestCheckoutIntentSchema = z.object({
  guestFirstName: z.string().min(1).max(100),
  guestLastName: z.string().min(1).max(100),
  guestEmail: z.string().email(),
  guestPhone: z.string().min(10).max(20),
  items: z.array(squareCheckoutItemSchema).min(1),
  promoCode: z
    .string()
    .trim()
    .max(40)
    .transform(value => value.toUpperCase())
    .optional(),
});

export type SquareGuestCheckoutIntentInput = z.infer<typeof squareGuestCheckoutIntentSchema>;

export const squareGuestCheckoutFinalizeSchema = z.object({
  sourceId: z.string().min(1), // Payment token from Square Web Payments SDK
  verificationToken: z.string().optional(),
  guestFirstName: z.string().min(1).max(100),
  guestLastName: z.string().min(1).max(100),
  guestEmail: z.string().email(),
  guestPhone: z.string().min(10).max(20),
  items: z.array(squareCheckoutItemSchema).min(1),
  promoCode: z
    .string()
    .trim()
    .max(40)
    .transform(value => value.toUpperCase())
    .optional(),
});

export type SquareGuestCheckoutFinalizeInput = z.infer<typeof squareGuestCheckoutFinalizeSchema>;
