import { z } from 'zod';

// Maximum allowed purchase amount
const MAX_UNIT_PRICE = 1000;
// Maximum quantity per line item
const MAX_ITEM_QUANTITY = 100;

// Minimum price per Square requirement ($0.50 = 50 cents displayed as dollars)
const MIN_UNIT_PRICE = 0.50;

// Name regex for guest info
const nameRegex = /^[A-Za-zÀ-ÿ\s'-]+$/;

// Phone: strip non-digits, require exactly 10
const phoneSchema = z
  .string()
  .trim()
  .transform(val => val.replace(/\D/g, ''))
  .refine(val => val.length === 10, 'Phone must be exactly 10 digits');

export const squareCheckoutItemSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('ticket'),
    label: z.string().min(1),
    quantity: z.number().int().min(1).max(MAX_ITEM_QUANTITY),
    unitPrice: z.number().min(MIN_UNIT_PRICE, 'Minimum price is $0.50').max(MAX_UNIT_PRICE),
    eventId: z.string().optional(),
    // Sibling bundle ticket type id (ticket_types.ticket_type_id). When present, the
    // unit price is validated against the bundle's DB price instead of single admission.
    bundleId: z.string().optional(),
    metadata: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
  }),
  z.object({
    type: z.literal('membership'),
    label: z.string().min(1),
    membershipId: z.string().min(1),
    durationMonths: z.number().int().positive().max(24),
    autoRenew: z.boolean().optional(),
    unitPrice: z.number().min(MIN_UNIT_PRICE, 'Minimum price is $0.50').max(MAX_UNIT_PRICE),
    refundPolicyAccepted: z.boolean().optional(),
    refundPolicyAcceptedAt: z.string().datetime().optional(),
    referralName: z.string().trim().max(100).optional(),
    // childInfo is required for memberships. Either reference an existing child by ID
    // (which must already have a photo on file) or provide full child details for a new
    // child record. The service layer enforces the photo requirement after creation.
    childInfo: z.union([
      z.object({
        childId: z.number().int().positive(),
      }),
      z.object({
        firstName: z.string().min(1, 'Child first name is required').max(100),
        lastName: z.string().min(1, 'Child last name is required').max(100),
        birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Child birth date must be YYYY-MM-DD'),
      }),
    ]),
    parentZipCode: z.string().trim().min(5, 'Parent ZIP code is required').max(10),
    parentPhone: phoneSchema,
  }),
  z.object({
    type: z.literal('booking'),
    label: z.string().min(1), // Package name
    packageId: z.string().min(1),
    unitPrice: z.number().min(MIN_UNIT_PRICE, 'Minimum price is $0.50').max(MAX_UNIT_PRICE), // Total price
    location: z.string().min(1).max(200),
    eventDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format'),
    startTime: z.string().regex(/^\d{2}:\d{2}$/, 'Time must be in HH:MM format'),
    guestCount: z.number().int().min(1).max(100),
    // Booking creation data
    childIds: z.array(z.string()).optional(),
    notes: z.string().max(500).optional(),
    addOns: z.array(z.object({
      id: z.string(),
      quantity: z.number().int().min(1).max(20),
    })).optional(),
    // Guest booking data (for non-authenticated users)
    guestInfo: z.object({
      firstName: z.string().min(1).max(100).regex(nameRegex, 'Name must contain only letters'),
      lastName: z.string().min(1).max(100).regex(nameRegex, 'Name must contain only letters'),
      email: z.string().trim().email().toLowerCase(),
      phone: phoneSchema,
      childName: z.string().min(1).max(100).regex(nameRegex, 'Name must contain only letters'),
      childBirthDate: z.string().optional(),
      additionalChildren: z.array(z.object({
        name: z.string().min(1).max(100).regex(nameRegex, 'Name must contain only letters'),
        birthDate: z.string().optional(),
      })).optional(),
    }).optional(),
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
    .regex(/^[A-Za-z0-9-_]*$/, 'Promo code must be alphanumeric')
    .transform(value => value.toUpperCase())
    .optional(),
});

export type SquareCheckoutIntentInput = z.infer<typeof squareCheckoutIntentSchema>;

// Square checkout finalize - includes the payment token from Web Payments SDK
export const squareCheckoutFinalizeSchema = z.object({
  sourceId: z.string().min(1), // Payment token from Square Web Payments SDK
  verificationToken: z.string().optional(), // SCA verification token if required
  reservationId: z.string().uuid().optional(), // Existing slot reservation from frontend
  checkoutSessionId: z.string().uuid().optional(), // Checkout session ID for 5-minute timer tracking
  items: z.array(squareCheckoutItemSchema).min(1),
  promoCode: z
    .string()
    .trim()
    .max(40)
    .regex(/^[A-Za-z0-9-_]*$/, 'Promo code must be alphanumeric')
    .transform(value => value.toUpperCase())
    .optional(),
});

export type SquareCheckoutFinalizeInput = z.infer<typeof squareCheckoutFinalizeSchema>;

// Guest checkout schemas
export const squareGuestCheckoutIntentSchema = z.object({
  guestFirstName: z.string().min(1).max(100).regex(nameRegex, 'Name must contain only letters'),
  guestLastName: z.string().min(1).max(100).regex(nameRegex, 'Name must contain only letters'),
  guestEmail: z.string().trim().email().toLowerCase(),
  guestPhone: phoneSchema,
  items: z.array(squareCheckoutItemSchema).min(1),
  promoCode: z
    .string()
    .trim()
    .max(40)
    .regex(/^[A-Za-z0-9-_]*$/, 'Promo code must be alphanumeric')
    .transform(value => value.toUpperCase())
    .optional(),
});

export type SquareGuestCheckoutIntentInput = z.infer<typeof squareGuestCheckoutIntentSchema>;

export const squareGuestCheckoutFinalizeSchema = z.object({
  sourceId: z.string().min(1), // Payment token from Square Web Payments SDK
  verificationToken: z.string().optional(),
  reservationId: z.string().uuid().optional(), // Existing slot reservation from frontend
  checkoutSessionId: z.string().uuid().optional(), // Checkout session ID for 5-minute timer tracking
  guestFirstName: z.string().min(1).max(100).regex(nameRegex, 'Name must contain only letters'),
  guestLastName: z.string().min(1).max(100).regex(nameRegex, 'Name must contain only letters'),
  guestEmail: z.string().trim().email().toLowerCase(),
  guestPhone: phoneSchema,
  items: z.array(squareCheckoutItemSchema).min(1),
  promoCode: z
    .string()
    .trim()
    .max(40)
    .regex(/^[A-Za-z0-9-_]*$/, 'Promo code must be alphanumeric')
    .transform(value => value.toUpperCase())
    .optional(),
});

export type SquareGuestCheckoutFinalizeInput = z.infer<typeof squareGuestCheckoutFinalizeSchema>;
