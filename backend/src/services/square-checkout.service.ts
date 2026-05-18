import { randomUUID, createHash } from 'crypto';
import type { CreatePaymentRequest, Money } from 'square';
import { DateTime } from 'luxon';

import { getSquareClient, getSquareLocationId } from '../config/square';
import { appConfig } from '../config/env';
import { UserRepository, PaymentRepository, MembershipRepository, MembershipPlanRepository, OrderRepository, PromotionRepository, PricingConfigRepository, CustomerRepository, PartyBookingRepository, PartyPackageRepository, PartyAddOnRepository, EventRepository, ProductPromotionRepository, ChildRepository } from '../repositories';
import {
  getTaxRate as getPricingTaxRate,
  getTaxRateSync as getPricingTaxRateSync,
  getCleaningFee as getPricingCleaningFee,
  getExtraChildFee,
  getExtraAdultFee,
  getSingleAdmissionPrice,
  roundCurrency as pricingRoundCurrency,
  initializePricingCache,
} from './pricing-config.service';
import { AppError } from '../utils/app-error';
import { PAYMENT_STATUS } from '../utils/payment-statuses';
import { getUserFriendlyErrorMessage, logPaymentInitiated, logPaymentCompleted, logPaymentFailed, type SquareError } from './payment-logger.service';
import { reserveTickets } from './ticket.service';
import { purchaseMembership } from './membership.service';
import { sendOrderConfirmation, sendBookingConfirmation, sendAdminBookingNotification, sendAdminTicketNotification, sendAdminMembershipNotification, type BookingEmailData } from './email.service';
import { sendOrderConfirmationSms, sendTicketConfirmationSms, sendBookingConfirmationSms, type BookingSmsData } from './sms.service';
import { generateReceiptPDF, generateBookingReceiptPDF, createReceiptRecord } from './receipt.service';
import { reserveSlot, confirmReservation, getReservation } from './slot-reservation.service';
import { completeCheckoutSession } from './checkout-session.service';
import { logger } from '../utils/logger';
import {
  toSquareMoney,
  PAYMENT_LIMITS,
  dollarsToCents,
  centsToDollars,
  calculateTaxCents,
} from '../utils/currency';
import { withRetry } from '../utils/retry';
import { tryEvaluateCoupon, type CouponEvaluation } from './coupon.service';

// Valid payment statuses (Fix #4 - accept PENDING for ACH, Afterpay, etc.)
const VALID_PAYMENT_STATUSES = ['COMPLETED', 'PENDING'];

import type {
  SquareCheckoutIntentInput,
  SquareCheckoutFinalizeInput,
  SquareCheckoutItemInput,
  SquareGuestCheckoutIntentInput,
  SquareGuestCheckoutFinalizeInput,
} from '../schemas/square-checkout.schema';

// Tier name mapping for database plans (same as membership.service.ts)
const REVERSE_TIER_MAP: Record<string, string[]> = {
  'explorer': ['Silver'],
  'adventurer': ['Gold'],
  'champion': ['Platinum', 'VIP Platinum'],
  'promo_1kid': ['Promo - 1 Kid + 1 Adult'],
  'promo_2kids': ['Promo - 2 Kids + 2 Adults'],
  'promo_3kids': ['Promo - 3 Kids + 3 Adults'],
};

// Price tolerance in cents (allow 1 cent rounding difference)
const PRICE_TOLERANCE_CENTS = 1;

/**
 * Generate a deterministic hash of the sourceId to use in idempotency keys.
 * SECURITY: Uses full hash instead of just last 8 chars to prevent collision attacks.
 */
function hashSourceId(sourceId: string): string {
  return createHash('sha256').update(sourceId).digest('hex').slice(0, 16);
}

/**
 * Build a descriptive payment note for Square from actual item labels.
 * e.g. "Mini Plan Membership, General Admission x2 | Playfunia"
 * Square note field max is 500 chars.
 */
function buildSquarePaymentNote(items: SquareCheckoutItemInput[]): string {
  const parts: string[] = [];
  for (const item of items) {
    if (item.type === 'membership') {
      parts.push(`${item.label} Membership`);
    } else if (item.type === 'booking') {
      parts.push(`${item.label} Party Booking`);
    } else {
      // ticket
      const qty = item.quantity > 1 ? ` x${item.quantity}` : '';
      parts.push(`${item.label}${qty}`);
    }
  }
  const description = parts.join(', ');
  const note = `${description} | Playfunia`;
  // Square note max 500 chars
  return note.length > 500 ? note.slice(0, 497) + '...' : note;
}

/**
 * SECURITY: Validate that frontend-submitted prices match database prices.
 * This prevents price manipulation attacks where attackers modify localStorage or intercept API calls.
 */
async function validateItemPrices(items: SquareCheckoutItemInput[]): Promise<void> {
  for (const item of items) {
    if (item.type === 'ticket') {
      let expectedPrice: number;

      if (item.eventId) {
        // Event ticket - validate event exists
        const event = await EventRepository.findById(parseInt(item.eventId, 10));
        if (!event) {
          throw new AppError('Event not found', 404);
        }

        expectedPrice = item.unitPrice; // Events no longer have a price column
      } else {
        // General admission ticket - validate against single admission price
        expectedPrice = await getSingleAdmissionPrice();
      }

      const priceDiffCents = Math.abs(dollarsToCents(item.unitPrice) - dollarsToCents(expectedPrice));

      if (priceDiffCents > PRICE_TOLERANCE_CENTS) {
        logger.warn({
          itemType: 'ticket',
          submittedPrice: item.unitPrice,
          expectedPrice,
          eventId: item.eventId,
          label: item.label,
        }, 'Price manipulation detected: ticket price mismatch');
        throw new AppError(
          'Ticket price has changed. Please refresh the page and try again.',
          400
        );
      }
    }

    if (item.type === 'membership') {
      // Validate membership price against database
      const planId = parseInt(item.membershipId, 10);
      const [plan, promo] = await Promise.all([
        MembershipPlanRepository.findById(planId),
        ProductPromotionRepository.findActive('membership', planId),
      ]);

      if (!plan) {
        throw new AppError('Membership plan not found', 404);
      }

      // Calculate effective monthly price (accounting for active promo)
      let effectiveMonthlyPrice = plan.monthly_price;
      if (promo) {
        effectiveMonthlyPrice = promo.discount_type === 'percent'
          ? Math.round(plan.monthly_price * (1 - promo.discount_value / 100) * 100) / 100
          : promo.discount_value;
      }

      // Calculate expected total (effectiveMonthlyPrice * durationMonths)
      const expectedTotal = effectiveMonthlyPrice * item.durationMonths;
      const priceDiffCents = Math.abs(dollarsToCents(item.unitPrice) - dollarsToCents(expectedTotal));

      if (priceDiffCents > PRICE_TOLERANCE_CENTS) {
        logger.warn({
          itemType: 'membership',
          submittedPrice: item.unitPrice,
          expectedPrice: expectedTotal,
          planId,
          durationMonths: item.durationMonths,
          hasPromo: !!promo,
        }, 'Price manipulation detected: membership price mismatch');
        throw new AppError(
          'Membership price has changed. Please refresh the page and try again.',
          400
        );
      }
    }

    if (item.type === 'booking') {
      // Validate booking price against database
      const packageId = parseInt(item.packageId, 10);
      const partyPackage = await PartyPackageRepository.findById(packageId);

      if (!partyPackage) {
        throw new AppError('Party package not found', 404);
      }

      // Calculate expected price from package + add-ons + cleaning fee
      const globalCleaningFee = await getPricingCleaningFee();
      const cleaningFee = (partyPackage as any).cleaning_fee != null ? Number((partyPackage as any).cleaning_fee) : globalCleaningFee;
      const extraAdultFee = await getExtraAdultFee();

      let expectedSubtotal = partyPackage.price_usd ?? 0;

      // Process add-ons
      if (item.addOns && item.addOns.length > 0) {
        const addOnDefinitions = await PartyAddOnRepository.findAll(true);
        const addOnMap = new Map(addOnDefinitions.map(a => [a.code, a]));

        for (const addOn of item.addOns) {
          const def = addOnMap.get(addOn.id);
          if (def) {
            if (addOn.id === 'extra_adult') {
              expectedSubtotal += (addOn.quantity ?? 0) * extraAdultFee;
            } else if (addOn.id === 'extra_child') {
              // Already counted above, skip
            } else {
              expectedSubtotal += def.price * (addOn.quantity ?? 1);
            }
          }
        }
      }

      // Expected unitPrice = subtotal + cleaningFee
      const expectedUnitPrice = expectedSubtotal + cleaningFee;
      const priceDiffCents = Math.abs(dollarsToCents(item.unitPrice) - dollarsToCents(expectedUnitPrice));

      // Fixed 10-cent max tolerance instead of percentage-based (prevents underpayment on large bookings)
      const toleranceCents = 10;

      if (priceDiffCents > toleranceCents) {
        logger.warn({
          itemType: 'booking',
          submittedPrice: item.unitPrice,
          expectedPrice: expectedUnitPrice,
          packageId,
          guestCount: item.guestCount,
          addOns: item.addOns,
        }, 'Price manipulation detected: booking price mismatch');
        throw new AppError(
          'Booking price has changed. Please refresh the page and try again.',
          400
        );
      }
    }
  }
}

// Cache for pricing config values (refreshed on each checkout)
let cachedSiblingDiscountRate: number | null = null;

async function getSiblingDiscountRate(): Promise<number> {
  if (cachedSiblingDiscountRate === null) {
    cachedSiblingDiscountRate = await PricingConfigRepository.getValue('sibling_discount_rate', 5);
  }
  return cachedSiblingDiscountRate / 100; // Convert from percentage to decimal
}

/**
 * Convert checkout items to the lightweight cart shape the coupon service expects.
 * Tickets carry quantity; memberships and bookings are unit-priced singletons.
 */
function toCouponItems(items: SquareCheckoutItemInput[]) {
  return items.map(item => ({
    type: item.type,
    unitPrice: item.unitPrice,
    quantity: item.type === 'ticket' ? item.quantity : 1,
  }));
}

interface CheckoutLine {
  type: SquareCheckoutItemInput['type'];
  label: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
  discounts: Array<{ label: string; amount: number }>;
  total: number;
  metadata?: Record<string, unknown> | undefined;
}

export interface SquareCheckoutSummary {
  currency: string;
  subtotal: number;
  discounts: Array<{ label: string; amount: number }>;
  taxRate: number;
  taxAmount: number;
  total: number;
  lines: CheckoutLine[];
}

// Tax rate - use centralized pricing config service
async function getTaxRate(): Promise<number> {
  return getPricingTaxRate();
}

// Sync version for places that can't be async - uses cached value from pricing config service
function getTaxRateSync(): number {
  return getPricingTaxRateSync();
}

// Fix #11 & #12: Use precise currency utilities from utils/currency.ts
// roundCurrency now goes through cents to avoid floating point issues
function roundCurrency(value: number) {
  return centsToDollars(dollarsToCents(value));
}

// Note: toSquareMoney is now imported from utils/currency.ts (Fix #11)

/**
 * Normalize time formats for robust comparison (Fix #10)
 * PostgreSQL TIME can return "HH:MM:SS" or "HH:MM:SS.sss"
 * Frontend sends "HH:MM"
 * This ensures consistent comparison regardless of format
 */
function normalizeTime(time: string | null | undefined): string {
  if (!time) return '';
  // Extract just HH:MM from any format
  const match = time.match(/^(\d{2}):(\d{2})/);
  return match ? `${match[1]}:${match[2]}` : '';
}

async function getUserWithMembership(userId: string) {
  const userIdNum = parseInt(userId, 10);
  if (isNaN(userIdNum)) {
    throw new AppError('Invalid user ID', 400);
  }

  const user = await UserRepository.findById(userIdNum);
  if (!user) {
    throw new AppError('User not found', 404);
  }

  let membershipDiscount = 0;

  if (user.customer_id) {
    const membership = await MembershipRepository.findByCustomerId(user.customer_id);
    if (membership && membership.status === 'active') {
      // Fetch discount from membership_plans table based on tier
      const plans = await MembershipPlanRepository.findAll(true);
      const planNames = REVERSE_TIER_MAP[membership.tier] ?? [];
      const plan = plans.find(p => planNames.includes(p.name));
      membershipDiscount = plan?.discount_percent ?? 0;
    }
  }

  return { user, membershipDiscount };
}

// No discounts applied - flat pricing
async function calculateLine(item: SquareCheckoutItemInput, _membershipDiscountPercent: number): Promise<CheckoutLine> {
  if (item.type === 'membership') {
    const subtotal = roundCurrency(item.unitPrice);
    return {
      type: 'membership',
      label: item.label,
      quantity: 1,
      unitPrice: item.unitPrice,
      subtotal,
      discounts: [],
      total: subtotal,
      metadata: undefined,
    };
  }

  // Booking items - full payment (no deposits)
  if (item.type === 'booking') {
    const subtotal = roundCurrency(item.unitPrice);
    return {
      type: 'booking',
      label: item.label,
      quantity: 1,
      unitPrice: item.unitPrice,
      subtotal,
      discounts: [],
      total: subtotal,
      metadata: {
        packageId: item.packageId,
        eventDate: item.eventDate,
        startTime: item.startTime,
        location: item.location,
        guestCount: item.guestCount,
      },
    };
  }

  // Ticket items - flat pricing, no discounts
  const subtotal = roundCurrency(item.unitPrice * item.quantity);
  const total = subtotal;

  return {
    type: item.type,
    label: item.label,
    quantity: item.quantity,
    unitPrice: item.unitPrice,
    subtotal,
    discounts: [],
    total,
    metadata: item.metadata,
  };
}

async function buildSummary(
  userId: string,
  items: SquareCheckoutItemInput[],
  promoCode?: string,
): Promise<{
  summary: SquareCheckoutSummary;
  user: Awaited<ReturnType<typeof getUserWithMembership>>['user'];
  coupon: CouponEvaluation | null;
}> {
  // Reset cache for fresh pricing data
  cachedSiblingDiscountRate = null;

  const { user, membershipDiscount } = await getUserWithMembership(userId);

  // Calculate lines - no per-line discounts applied
  const lines = await Promise.all(items.map(item => calculateLine(item, membershipDiscount)));
  const subtotal = roundCurrency(lines.reduce((sum, line) => sum + line.subtotal, 0));

  // Apply coupon (if any) against the eligible portion of the cart
  const coupon = await tryEvaluateCoupon(promoCode, toCouponItems(items));
  const couponDiscount = coupon ? coupon.discountAmount : 0;
  const discounts: Array<{ label: string; amount: number }> = coupon
    ? [{ label: coupon.label, amount: coupon.discountAmount }]
    : [];
  const discountedSubtotal = roundCurrency(Math.max(0, subtotal - couponDiscount));

  // Tax is computed on the discounted subtotal
  const taxRate = getTaxRateSync();
  const taxAmount = roundCurrency(discountedSubtotal * taxRate);
  const total = roundCurrency(discountedSubtotal + taxAmount);

  return {
    summary: {
      currency: 'usd',
      subtotal,
      discounts,
      taxRate: Math.round(taxRate * 100),
      taxAmount,
      total,
      lines,
    },
    user,
    coupon,
  };
}

async function buildGuestSummary(
  items: SquareCheckoutItemInput[],
  promoCode?: string,
): Promise<{ summary: SquareCheckoutSummary; coupon: CouponEvaluation | null }> {
  // Bug fix #11: Reset sibling discount cache for guest checkout (same as buildSummary)
  cachedSiblingDiscountRate = null;

  const lines = await Promise.all(items.map(item => calculateLine(item, 0)));
  const subtotal = roundCurrency(lines.reduce((sum, line) => sum + line.subtotal, 0));

  const coupon = await tryEvaluateCoupon(promoCode, toCouponItems(items));
  const couponDiscount = coupon ? coupon.discountAmount : 0;
  const discounts: Array<{ label: string; amount: number }> = coupon
    ? [{ label: coupon.label, amount: coupon.discountAmount }]
    : [];
  const discountedSubtotal = roundCurrency(Math.max(0, subtotal - couponDiscount));

  const taxRate = getTaxRateSync();
  const taxAmount = roundCurrency(discountedSubtotal * taxRate);
  const total = roundCurrency(discountedSubtotal + taxAmount);

  return {
    summary: {
      currency: 'usd',
      subtotal,
      discounts,
      taxRate: Math.round(taxRate * 100),
      taxAmount,
      total,
      lines,
    },
    coupon,
  };
}

function assertSquareConfigured() {
  if (!appConfig.squareAccessToken) {
    throw new AppError('Payments are temporarily unavailable. Please try again later.', 503);
  }
}

/**
 * Create checkout intent (returns summary for frontend to display)
 * Unlike Stripe, Square doesn't need a pre-created payment intent.
 * The frontend will collect card info and generate a token.
 */
export async function createSquareCheckoutPaymentIntent(userId: string, input: SquareCheckoutIntentInput) {
  const { summary, user } = await buildSummary(userId, input.items, input.promoCode);

  if (summary.total <= 0) {
    throw new AppError('No payment is required for this cart', 400);
  }

  return {
    amount: summary.total,
    currency: 'usd',
    summary,
    promoCode: input.promoCode,
    // No clientSecret for Square - frontend generates token
  };
}

/**
 * Finalize checkout with Square payment
 *
 * INDUSTRY-STANDARD E-COMMERCE CHECKOUT FLOW:
 * 1. Validate all items (availability, pricing)
 * 2. Create order record (status: Pending)
 * 3. Process payment
 * 4. Fulfill items (create tickets/memberships/bookings)
 * 5. Update order status (Completed)
 * 6. Send notifications (async - non-blocking)
 */
export async function finalizeSquareCheckout(userId: string, input: SquareCheckoutFinalizeInput) {
  assertSquareConfigured();

  // ============================================================
  // PHASE 0: PRICE VALIDATION (Critical Security Check)
  // ============================================================
  // SECURITY: Validate frontend-submitted prices against database prices
  // This prevents price manipulation attacks
  await validateItemPrices(input.items);

  const { summary, user, coupon } = await buildSummary(userId, input.items, input.promoCode);

  if (summary.total <= 0) {
    throw new AppError('No payment is required for this cart', 400);
  }

  // Fix #7 & #19: Validate payment amount is within Square's limits
  if (summary.total < PAYMENT_LIMITS.MIN_USD) {
    throw new AppError(`Minimum payment amount is $${PAYMENT_LIMITS.MIN_USD.toFixed(2)}`, 400);
  }
  if (summary.total > PAYMENT_LIMITS.MAX_USD) {
    throw new AppError(`Payment amount exceeds the maximum of $${PAYMENT_LIMITS.MAX_USD.toFixed(2)}`, 400);
  }

  // ============================================================
  // PHASE 1: PRE-VALIDATION & SLOT RESERVATION (Before any payment)
  // ============================================================
  // Validate all items and atomically reserve booking slots to prevent TOCTOU race conditions
  // Session ID ties reservations to this checkout attempt
  // SECURITY: Use hash of full sourceId to prevent collision attacks
  const sessionId = `checkout_${userId}_${hashSourceId(input.sourceId)}`;
  const slotReservations: Map<number, string> = new Map(); // itemIndex -> reservationId

  for (const [itemIndex, item] of input.items.entries()) {
    if (item.type === 'booking') {
      // Verify party package exists and get details
      const packageId = parseInt(item.packageId, 10);
      const partyPackage = await PartyPackageRepository.findById(packageId);
      if (!partyPackage) {
        throw new AppError(`Party package not found: ${item.label}`, 400);
      }

      // SECURITY: Validate that booking date/time is in the future
      const eventDate = DateTime.fromISO(item.eventDate, { zone: 'America/New_York' });
      const [hour, minute] = item.startTime.split(':').map(Number);
      const startDateTime = eventDate.set({ hour, minute, second: 0, millisecond: 0 });

      if (startDateTime <= DateTime.now().setZone('America/New_York')) {
        throw new AppError(
          `Cannot book a party in the past. Please select a future date and time.`,
          400
        );
      }

      // Check if frontend already reserved the slot (passed reservationId)
      // This prevents double-reservation when frontend reserves before calling finalize
      if (input.reservationId) {
        // Validate the existing reservation
        const existingReservation = await getReservation(input.reservationId);
        if (!existingReservation) {
          throw new AppError('Reservation not found. Please try again.', 404);
        }
        if (existingReservation.status === 'expired') {
          throw new AppError('Your reservation has expired. Please select the time slot again.', 410);
        }
        if (existingReservation.status === 'cancelled') {
          throw new AppError('Reservation was cancelled. Please try again.', 410);
        }
        if (existingReservation.status !== 'pending' && existingReservation.status !== 'confirmed') {
          throw new AppError(`Invalid reservation status: ${existingReservation.status}`, 400);
        }
        // Validate that reservation matches the booking item
        // Fix #10: Use robust time normalization for comparison
        const reservationTime = normalizeTime(existingReservation.slot_time);
        const itemTime = normalizeTime(item.startTime);
        if (existingReservation.slot_date !== item.eventDate ||
            reservationTime !== itemTime ||
            existingReservation.location_name !== item.location) {
          logger.warn({
            reservationId: input.reservationId,
            reservation: { date: existingReservation.slot_date, time: existingReservation.slot_time, location: existingReservation.location_name },
            item: { date: item.eventDate, time: item.startTime, location: item.location },
          }, 'Reservation mismatch detected');
          throw new AppError('Reservation does not match the booking details.', 400);
        }
        // Check if reservation is still valid (not expired by time)
        if (new Date(existingReservation.expires_at) < new Date()) {
          throw new AppError('Your reservation has expired. Please select the time slot again.', 410);
        }
        slotReservations.set(itemIndex, input.reservationId);
        logger.info({
          reservationId: input.reservationId,
          eventDate: item.eventDate,
          startTime: item.startTime,
          location: item.location,
        }, 'Using existing frontend reservation');
      } else {
        // No reservationId provided - create new reservation (API callers without frontend)
        // SECURITY: Atomically reserve the slot to prevent double-booking race conditions
        // The reservation expires in 5 minutes if payment doesn't complete
        try {
          const reservation = await reserveSlot(
            item.eventDate,
            item.startTime,
            item.location,
            parseInt(userId, 10),
            sessionId
          );
          slotReservations.set(itemIndex, reservation.reservationId);
          logger.info({
            reservationId: reservation.reservationId,
            eventDate: item.eventDate,
            startTime: item.startTime,
            location: item.location,
            expiresAt: reservation.expiresAt,
          }, 'Slot reserved for checkout');
        } catch (err) {
          // Slot is no longer available - another user reserved it
          if (err instanceof AppError && err.statusCode === 409) {
            throw new AppError(
              `The time slot ${item.startTime} on ${item.eventDate} at ${item.location} is no longer available. Please select a different time.`,
              409
            );
          }
          throw err;
        }
      }
    }

    if (item.type === 'membership') {
      // Verify membership plan exists
      const planId = parseInt(item.membershipId, 10);
      if (isNaN(planId)) {
        throw new AppError(`Invalid membership plan ID: ${item.label}`, 400);
      }
      const plan = await MembershipPlanRepository.findById(planId);
      if (!plan || !plan.is_active) {
        throw new AppError(`Membership plan not found or inactive: ${item.label}`, 400);
      }
    }
  }

  // ============================================================
  // PHASE 2: CREATE ORDER (Status: Pending)
  // ============================================================
  const order = await OrderRepository.create({
    customer_id: user.customer_id ?? undefined,
    order_type: 'Mixed',
    status: 'Pending',
    subtotal_usd: summary.subtotal,
    discount_usd: summary.discounts.reduce((sum, d) => sum + d.amount, 0),
    tax_usd: summary.taxAmount,
    total_usd: summary.total,
    notes: buildSquarePaymentNote(input.items),
    promotion_id: coupon?.promotionId ?? null,
    coupon_code: coupon?.code ?? null,
  });

  logger.info({
    orderId: order.order_id,
    userId,
    customerId: user.customer_id,
    subtotal: summary.subtotal,
    tax: summary.taxAmount,
    total: summary.total,
    itemCount: input.items.length,
    items: input.items.map(i => ({ type: i.type, label: i.label, unitPrice: i.unitPrice })),
  }, 'Order created (Pending) — starting payment');

  // Use order_id as part of idempotency key to prevent duplicate payments
  // SECURITY: Use hash of full sourceId to prevent collision attacks
  const idempotencyKey = `checkout_${order.order_id}_${hashSourceId(input.sourceId)}`;

  let paymentId: string;
  let receiptUrl: string | null | undefined = null;

  // ============================================================
  // PHASE 3: PROCESS PAYMENT
  // ============================================================
  const paymentStartTime = Date.now();
  const logResult = await logPaymentInitiated({
    idempotencyKey,
    customerId: user.customer_id ?? null,
    userId: user.user_id ?? null,
    paymentType: 'checkout',
    amount: summary.total,
    referenceId: `order_${order.order_id}`,
    metadata: { orderId: order.order_id, itemCount: input.items.length, checkoutSessionId: input.checkoutSessionId ?? null },
  }, {
    sourceId: input.sourceId,
    idempotencyKey,
    amountMoney: toSquareMoney(summary.total),
    locationId: getSquareLocationId(),
  } as CreatePaymentRequest);

  try {
    {
      const square = getSquareClient();
      const locationId = getSquareLocationId();

      const paymentRequest: CreatePaymentRequest = {
        sourceId: input.sourceId,
        idempotencyKey,
        amountMoney: toSquareMoney(summary.total),
        locationId,
        referenceId: `order_${order.order_id}`,
        note: buildSquarePaymentNote(input.items),
        // Enable autocomplete to capture payment immediately
        autocomplete: true,
      };

      if (input.verificationToken) {
        paymentRequest.verificationToken = input.verificationToken;
      }

      // Fix #15: Add retry logic for transient errors (429, 5xx, network issues)
      const response = await withRetry(
        () => square.payments.create(paymentRequest),
        { maxRetries: 3, operationName: 'squarePaymentCreate' }
      );

      // Fix #4: Accept both COMPLETED and PENDING statuses
      // PENDING is valid for ACH transfers, Afterpay/Clearpay, gift cards, etc.
      if (!response.payment || !VALID_PAYMENT_STATUSES.includes(response.payment.status ?? '')) {
        logger.warn({ orderId: order.order_id, paymentStatus: response.payment?.status, elapsed: Date.now() - paymentStartTime }, 'Order Failed — invalid payment status');
        await OrderRepository.update(order.order_id, { status: 'Failed' });
        await logPaymentFailed(logResult, [{ category: 'PAYMENT_METHOD_ERROR', code: response.payment?.status ?? 'UNKNOWN', detail: 'Invalid payment status' }], Date.now() - paymentStartTime);
        throw new AppError('Payment failed. Please try again.', 400);
      }

      const payment = response.payment;
      if (!payment.id) {
        logger.warn({ orderId: order.order_id, elapsed: Date.now() - paymentStartTime }, 'Order Failed — missing payment ID');
        await OrderRepository.update(order.order_id, { status: 'Failed' });
        await logPaymentFailed(logResult, [{ category: 'API_ERROR', code: 'MISSING_PAYMENT_ID', detail: 'Payment response missing ID' }], Date.now() - paymentStartTime);
        throw new AppError('Payment processing error. Please try again.', 500);
      }
      paymentId = payment.id;
      receiptUrl = payment.receiptUrl;

      await logPaymentCompleted(logResult, payment, Date.now() - paymentStartTime);
      logger.info({ orderId: order.order_id, paymentId, paymentStatus: payment.status, total: summary.total, elapsed: Date.now() - paymentStartTime }, 'Payment successful — fulfilling order');

      // Record payment with receipt URL (Fix #16)
      await PaymentRepository.create({
        order_id: order.order_id,
        provider: 'square',
        provider_payment_id: paymentId,
        amount_usd: summary.total,
        status: payment.status === 'PENDING' ? 'Pending' : 'Captured',
        receipt_url: payment.receiptUrl ?? null,
      });
    }
  } catch (paymentError) {
    // Update order to failed status
    await OrderRepository.update(order.order_id, { status: 'Failed' });

    // Convert Square API errors (e.g., invalid card, declined) to user-friendly messages
    if (paymentError && typeof paymentError === 'object' && !(paymentError instanceof AppError)) {
      const obj = paymentError as Record<string, unknown>;
      if ('statusCode' in obj && 'errors' in obj && Array.isArray(obj.errors)) {
        const statusCode = obj.statusCode as number;
        const errors = obj.errors as Array<{ code?: string; category?: string; detail?: string; field?: string }>;
        await logPaymentFailed(logResult, errors as SquareError[], Date.now() - paymentStartTime, obj);
        logger.error({ orderId: order.order_id, errorCode: errors[0]?.code, errorCategory: errors[0]?.category, errorDetail: errors[0]?.detail, total: summary.total, elapsed: Date.now() - paymentStartTime }, 'Order Failed — payment declined');
        if (statusCode >= 400 && statusCode < 500 && errors[0]?.code) {
          throw new AppError(getUserFriendlyErrorMessage(errors[0].code), 400);
        }
      }
    }
    throw paymentError;
  }

  // ============================================================
  // PHASE 4: FULFILL ITEMS (After successful payment)
  // ============================================================
  // Update order status to Processing during fulfillment
  await OrderRepository.update(order.order_id, { status: 'Processing' });

  const ticketResults: Array<{ cartIndex: number; ticket: unknown }> = [];
  const membershipResults: Array<{ cartIndex: number; membership: unknown }> = [];
  const bookingResults: Array<{ cartIndex: number; booking: unknown; item: SquareCheckoutItemInput }> = [];
  const fulfillmentErrors: string[] = [];

  for (const [index, item] of input.items.entries()) {
    const line = summary.lines[index];
    if (!line) {
      fulfillmentErrors.push(`Line ${index}: Could not match to summary`);
      continue;
    }

    try {
      if (item.type === 'ticket') {
        const pricePerTicket = line.quantity > 0 ? roundCurrency(line.total / line.quantity) : item.unitPrice;
        const ticket = await reserveTickets({
          guardianId: userId,
          type: item.eventId ? 'event' : 'general',
          eventId: item.eventId,
          quantity: item.quantity,
          price: pricePerTicket,
          metadata: {
            ...(item.metadata ?? {}),
            label: item.label,
            orderId: order.order_id,
            promoCode: input.promoCode,
            discounts: line.discounts,
          },
        });
        ticketResults.push({ cartIndex: index, ticket });
      }

      if (item.type === 'membership') {
        const membershipItem = item as typeof item & {
          childInfo: { childId?: number; firstName?: string; lastName?: string; birthDate?: string };
          parentZipCode: string;
          parentPhone: string;
        };

        // Validate that the parent account has the required identity fields.
        // The Zod schema guarantees childInfo / parentZipCode / parentPhone exist on the
        // wire payload, but we still need to confirm the account holder's name + email.
        const memberUser = await UserRepository.findById(parseInt(userId, 10));
        if (!memberUser) {
          throw new AppError('User account not found for membership purchase', 400);
        }
        if (!memberUser.first_name || !memberUser.last_name || !memberUser.email) {
          throw new AppError(
            'Your account is missing required information (first name, last name, email). Please update your profile before purchasing a membership.',
            400,
          );
        }

        // Sync parent phone + zip onto the user/customer record.
        const phoneDigits = (membershipItem.parentPhone ?? '').replace(/\D/g, '');
        const zipCode = (membershipItem.parentZipCode ?? '').trim();
        const userPatch: { phone?: string; address_postal_code?: string } = {};
        if (phoneDigits && memberUser.phone !== phoneDigits) userPatch.phone = phoneDigits;
        if (zipCode && memberUser.address_postal_code !== zipCode) userPatch.address_postal_code = zipCode;
        if (Object.keys(userPatch).length > 0) {
          await UserRepository.update(memberUser.user_id, userPatch);
        }

        // Ensure customer record exists and has the same contact info.
        let customerId = memberUser.customer_id;
        if (!customerId) {
          const created = await CustomerRepository.create({
            full_name: `${memberUser.first_name} ${memberUser.last_name}`.trim(),
            email: memberUser.email,
            phone: phoneDigits || memberUser.phone || undefined,
            address: zipCode || undefined,
          });
          customerId = created.customer_id;
          await UserRepository.update(memberUser.user_id, { customer_id: customerId });
        } else {
          await CustomerRepository.update(customerId, {
            phone: phoneDigits || memberUser.phone || undefined,
            address: zipCode || undefined,
          });
        }

        // Resolve / create the child record this membership covers, then enforce
        // the photo-on-file requirement.
        let childId: number | undefined;
        if (membershipItem.childInfo.childId) {
          childId = membershipItem.childInfo.childId;
        } else if (
          membershipItem.childInfo.firstName &&
          membershipItem.childInfo.lastName &&
          membershipItem.childInfo.birthDate
        ) {
          const child = await ChildRepository.create({
            customer_id: customerId,
            first_name: membershipItem.childInfo.firstName,
            last_name: membershipItem.childInfo.lastName,
            birth_date: membershipItem.childInfo.birthDate,
          });
          childId = child.child_id;
        }

        if (!childId) {
          throw new AppError('Child information is required for membership purchase.', 400);
        }

        const childRecord = await ChildRepository.findById(childId);
        if (!childRecord || childRecord.customer_id !== customerId) {
          throw new AppError('Selected child does not belong to this account.', 403);
        }
        if (!childRecord.photo_url || !childRecord.photo_storage_path) {
          throw new AppError(
            'A photo of the child is required for membership check-in verification. Please upload it before completing payment.',
            400,
          );
        }

        const membership = await purchaseMembership(userId, {
          membershipId: item.membershipId,
          durationMonths: item.durationMonths,
          autoRenew: item.autoRenew,
          refundPolicyAccepted: item.refundPolicyAccepted,
          refundPolicyAcceptedAt: item.refundPolicyAcceptedAt,
          referralName: (item as unknown as { referralName?: string }).referralName,
        }, { skipNotifications: true, paymentId, childId });
        membershipResults.push({ cartIndex: index, membership: { ...membership, childId } });
      }

      if (item.type === 'booking') {
        const packageId = parseInt(item.packageId, 10);
        const partyPackage = await PartyPackageRepository.findById(packageId);
        if (!partyPackage) {
          fulfillmentErrors.push(`Booking ${index}: Package not found`);
          continue;
        }

        // Calculate times
        const eventDate = DateTime.fromISO(item.eventDate, { zone: 'America/New_York' });
        const [hour, minute] = item.startTime.split(':').map(Number);
        const startDateTime = eventDate.set({ hour, minute, second: 0, millisecond: 0 });
        const baseDuration = (partyPackage.base_room_hours ?? 2) * 60;
        const hasExtraHour = (item.addOns ?? []).some(
          (a: any) => a.id === 'extra_hour' || a.productName?.toLowerCase().includes('extra hour')
        );
        const totalPartyMinutes = baseDuration + (hasExtraHour ? 60 : 0);
        const endDateTime = startDateTime.plus({ minutes: totalPartyMinutes });
        const scheduledEndDateTime = endDateTime.plus({ minutes: 30 }); // cleaning buffer

        // Generate unique reference
        const reference = `BK-${DateTime.now().toFormat('yyyyLLddHHmm')}-${randomUUID().slice(0, 8).toUpperCase()}`;

        // Use per-package cleaning fee if set, otherwise global
        const globalCleaningFee = await getPricingCleaningFee();
        const cleaningFee = (partyPackage as any).cleaning_fee != null ? Number((partyPackage as any).cleaning_fee) : globalCleaningFee;

        // SECURITY: Validate that subtotal is non-negative after subtracting cleaning fee
        // This prevents price manipulation attacks where cleaningFee > unitPrice
        const bookingSubtotal = item.unitPrice - cleaningFee;
        if (bookingSubtotal < 0) {
          throw new AppError(
            'Invalid booking price: unit price cannot be less than cleaning fee. Please refresh and try again.',
            400
          );
        }

        // Calculate tax using cents-based math for consistency with summary-level calculation
        const taxRate = getTaxRateSync();
        const unitPriceCents = dollarsToCents(item.unitPrice);
        const taxAmountCents = calculateTaxCents(unitPriceCents, taxRate);
        const taxAmount = centsToDollars(taxAmountCents);
        const totalWithTax = centsToDollars(unitPriceCents + taxAmountCents);

        // Create the booking
        // Note: Tax is calculated using (subtotal + cleaningFee) * taxRate at receipt time
        // The total already includes tax for proper payment amount
        const booking = await PartyBookingRepository.create({
          package_id: packageId,
          customer_id: user.customer_id ?? null,
          scheduled_start: startDateTime.toISO() ?? startDateTime.toJSDate().toISOString(),
          scheduled_end: scheduledEndDateTime.toISO() ?? scheduledEndDateTime.toJSDate().toISOString(),
          reference,
          location_name: item.location,
          event_date: item.eventDate,
          start_time: item.startTime,
          end_time: endDateTime.toFormat('HH:mm'),
          guests: item.guestCount,
          notes: item.notes,
          add_ons: item.addOns ?? [],
          subtotal: bookingSubtotal,
          cleaning_fee: cleaningFee,
          total: totalWithTax,
          deposit_amount: totalWithTax,
          balance_remaining: 0,
          payment_status: PAYMENT_STATUS.PAID,
          status: 'Confirmed',
          child_ids: item.childIds?.map(id => parseInt(id, 10)) ?? [],
        });

        // SECURITY: Confirm the slot reservation now that booking is created
        // This permanently locks the slot and links it to the booking
        const reservationId = slotReservations.get(index);
        if (reservationId) {
          try {
            await confirmReservation(reservationId, booking.booking_id);
            logger.info({ reservationId, bookingId: booking.booking_id }, 'Slot reservation confirmed');
          } catch (confirmErr) {
            // Log but don't fail - booking is created, reservation will expire naturally
            logger.error({ error: confirmErr, reservationId, bookingId: booking.booking_id }, 'Failed to confirm reservation');
          }
        }

        bookingResults.push({ cartIndex: index, booking, item });
      }
    } catch (fulfillError) {
      const errorMsg = fulfillError instanceof Error ? fulfillError.message : 'Unknown error';
      fulfillmentErrors.push(`Item ${index} (${item.type}): ${errorMsg}`);
      console.error(`Fulfillment error for item ${index}:`, fulfillError);
    }
  }

  // ============================================================
  // PHASE 5: HANDLE PARTIAL FULFILLMENT (Automatic Refund)
  // ============================================================
  let partialRefundIssued = false;
  let partialRefundAmount = 0;

  if (fulfillmentErrors.length > 0) {
    // Calculate refund amount for unfulfilled items
    const fulfilledIndices = new Set([
      ...ticketResults.map(t => t.cartIndex),
      ...membershipResults.map(m => m.cartIndex),
      ...bookingResults.map(b => b.cartIndex),
    ]);

    const unfulfilledLines = summary.lines.filter((_, idx) => !fulfilledIndices.has(idx));
    // Bug fix #1: Include proportional tax in refund amount (line totals are pre-tax)
    const unfulfilledSubtotal = unfulfilledLines.reduce((sum, line) => sum + line.total, 0);
    const unfulfilledTax = roundCurrency(unfulfilledSubtotal * getTaxRateSync());
    const unfulfilledAmount = roundCurrency(unfulfilledSubtotal + unfulfilledTax);

    if (unfulfilledAmount > 0) {
      try {
        const square = getSquareClient();

        // Fix #20: Use deterministic idempotency key (no timestamp) to prevent duplicate refunds
        const refundResponse = await square.refunds.refundPayment({
          paymentId,
          idempotencyKey: `refund_${order.order_id}_partial_${hashSourceId(paymentId)}`,
          amountMoney: toSquareMoney(unfulfilledAmount),
          reason: 'PARTIAL_FULFILLMENT_FAILURE',
        });

        if (refundResponse.refund?.status === 'COMPLETED' || refundResponse.refund?.status === 'PENDING') {
          partialRefundIssued = true;
          partialRefundAmount = unfulfilledAmount;
          logger.info({
            orderId: order.order_id,
            refundId: refundResponse.refund.id,
            amount: unfulfilledAmount,
            unfulfilledItems: unfulfilledLines.map(l => l.label),
          }, 'Partial refund issued for unfulfilled items');
        }
      } catch (refundError) {
        // Log error but don't fail - payment succeeded, manual refund may be needed
        logger.error({
          error: refundError,
          orderId: order.order_id,
          paymentId,
          amount: unfulfilledAmount,
          fulfillmentErrors,
        }, 'Partial refund failed - requires manual intervention');
      }
    }
  }

  // ============================================================
  // PHASE 6: UPDATE ORDER STATUS
  // ============================================================
  // If there were fulfillment errors, mark as partially completed
  const finalStatus = fulfillmentErrors.length > 0 ? 'Partial' : 'Completed';
  const orderNotes = fulfillmentErrors.length > 0
    ? `Fulfillment issues: ${fulfillmentErrors.join('; ')}${partialRefundIssued ? ` | Refund issued: $${partialRefundAmount.toFixed(2)}` : ' | Refund may be required'}`
    : undefined;

  await OrderRepository.update(order.order_id, {
    status: finalStatus,
    notes: orderNotes,
  });

  // Bump coupon redemption counter (best effort — don't fail the order on counter errors)
  if (coupon) {
    try {
      await PromotionRepository.incrementRedemptions(coupon.promotionId);
    } catch (err) {
      logger.warn({ err, promotionId: coupon.promotionId, orderId: order.order_id }, 'Failed to increment coupon redemptions');
    }
  }

  // Mark any associated checkout session as completed
  if (input.checkoutSessionId) {
    completeCheckoutSession(input.checkoutSessionId, order.order_id).catch(err =>
      logger.error({ error: err, checkoutSessionId: input.checkoutSessionId, orderId: order.order_id }, 'Failed to complete checkout session')
    );
  }

  // ============================================================
  // PHASE 6: SEND NOTIFICATIONS (Async - Non-blocking)
  // ============================================================
  // Fire-and-forget pattern: don't block response waiting for emails
  // This is industry standard - customers see confirmation immediately
  const orderNumber = `PF-${order.order_id}`;
  const orderDate = new Date().toLocaleString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: 'America/New_York',
  });

  // Execute notifications in background (don't await)
  setImmediate(async () => {
    try {
      await sendNotifications({
        user,
        orderNumber,
        orderDate,
        summary,
        paymentId,
        ticketResults,
        membershipResults,
        bookingResults,
      });
    } catch (notificationError) {
      console.error('Background notification error:', notificationError);
      // Log but don't fail - payment already succeeded
    }
  });

  return {
    paymentId,
    summary,
    tickets: ticketResults,
    memberships: membershipResults,
    bookings: bookingResults.map(b => ({
      cartIndex: b.cartIndex,
      bookingId: String((b.booking as { booking_id: number }).booking_id),
      reference: (b.booking as { reference: string }).reference,
    })),
    receiptEmail: user.email ?? null,
    receiptUrl,
  };
}

/**
 * Send all notifications (emails/SMS) - called asynchronously
 */
async function sendNotifications(params: {
  user: { email?: string | null; phone?: string | null; first_name?: string | null; last_name?: string | null; customer_id?: number | null };
  orderNumber: string;
  orderDate: string;
  summary: SquareCheckoutSummary;
  paymentId: string;
  ticketResults: Array<{ cartIndex: number; ticket: unknown }>;
  membershipResults: Array<{ cartIndex: number; membership: unknown }>;
  bookingResults: Array<{ cartIndex: number; booking: unknown; item: SquareCheckoutItemInput }>;
}) {
  const { user, orderNumber, orderDate, summary, paymentId, ticketResults, membershipResults, bookingResults } = params;

  if (!user.email) return;

  // Send booking confirmation emails for party bookings
  for (const bookingResult of bookingResults) {
      try {
        const booking = bookingResult.booking as {
          booking_id: number;
          reference?: string;
          event_date?: string;
          start_time?: string;
          location_name?: string;
          guests?: number;
          total?: number;
          deposit_amount?: number;
          balance_remaining?: number;
          package_id?: number;
          add_ons?: unknown;
          subtotal?: number;
          cleaning_fee?: number;
          customer_id?: number;
          child_ids?: number[];
          notes?: string;
        };
        const item = bookingResult.item as { type: 'booking'; packageId: string; unitPrice: number; guestCount: number; eventDate: string; startTime: string; label: string; location: string };

        // Get package details
        const packageId = parseInt(item.packageId, 10);
        const partyPackage = await PartyPackageRepository.findById(packageId);
        const packageName = partyPackage?.name ?? item.label;

        const reference = booking.reference ?? `PF-${booking.booking_id}`;
        const guestName = `${user.first_name ?? ''} ${user.last_name ?? ''}`.trim() || 'Customer';
        const eventDate = booking.event_date
          ? (() => { const p = booking.event_date.split('-'); return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2])).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }); })()
          : item.eventDate;
        const startTime = booking.start_time ?? item.startTime;
        const location = booking.location_name ?? 'Albany';
        const guestCount = booking.guests ?? item.guestCount;
        const totalAmount = booking.total ?? item.unitPrice;
        const depositPaid = booking.deposit_amount ?? item.unitPrice;
        const balanceRemaining = booking.balance_remaining ?? 0;
        const subtotal = booking.subtotal ?? 0;
        const cleaningFee = booking.cleaning_fee ?? 0;
        const packageBasePrice = partyPackage?.price_usd ?? 0;
        // Calculate tax from stored subtotal and cleaning fee using centralized tax rate
        const taxableAmount = subtotal + cleaningFee;
        const taxAmount = centsToDollars(calculateTaxCents(dollarsToCents(taxableAmount), getTaxRateSync()));

        // Parse add-ons to extract extra children and extra adults
        const addOnsArray = (booking.add_ons ?? []) as Array<{ id?: string; label?: string; name?: string; price: number; quantity: number }>;
        const extraChildAddOn = addOnsArray.find(a => a.id === 'extra_child' || a.name === 'Extra Child');
        const extraAdultAddOn = addOnsArray.find(a => a.id === 'extra_adult' || a.name === 'Extra Adult');

        // Extract counts from add-ons (preferred) or calculate from guest count
        const maxGuests = partyPackage?.base_children ?? 10;
        const extraChildrenCount = extraChildAddOn?.quantity ?? Math.max(0, guestCount - maxGuests);
        const extraAdultsCount = extraAdultAddOn?.quantity ?? 0;

        // Use stored price from add-on, or fetch from pricing config service
        const extraChildUnitPrice = extraChildAddOn?.price ?? await getExtraChildFee();
        const extraAdultUnitPrice = extraAdultAddOn?.price ?? await getExtraAdultFee();

        // Build extra children/adults data
        const extraChildren = extraChildrenCount > 0 ? {
          count: extraChildrenCount,
          unitPrice: extraChildUnitPrice,
          total: extraChildrenCount * extraChildUnitPrice,
        } : undefined;

        const extraAdults = extraAdultsCount > 0 ? {
          count: extraAdultsCount,
          unitPrice: extraAdultUnitPrice,
          total: extraAdultsCount * extraAdultUnitPrice,
        } : undefined;

        // Filter out extra_child and extra_adult from add-ons (they're shown separately)
        const addOns = addOnsArray.filter(a =>
          a.id !== 'extra_child' && a.id !== 'extra_adult' &&
          a.name !== 'Extra Child' && a.name !== 'Extra Adult'
        );
        const formattedAddOns = addOns.map(a => ({
          name: a.label ?? a.name ?? 'Add-on',
          price: a.price,
          quantity: a.quantity ?? 1,
        }));

        // Resolve children from DB for email/PDF
        const bookingChildIds = (booking.child_ids ?? []) as number[];
        let resolvedChildren: Array<{ name: string; birthDate?: string }> = [];
        if (bookingChildIds.length > 0) {
          try {
            const childRecords = await ChildRepository.findByIds(bookingChildIds);
            resolvedChildren = childRecords.map((c: any) => ({
              name: `${c.first_name || ''} ${c.last_name || ''}`.trim(),
              birthDate: c.birth_date || undefined,
            }));
          } catch (childErr) {
            console.error('Failed to resolve children for receipt:', childErr);
          }
        }
        const bookingNotes = booking.notes?.toString() || undefined;
        const customerPhone = user.phone ?? undefined;

        // Generate receipt
        let receiptNumber: string | undefined;
        let receiptPdf: Buffer | undefined;

        try {
          const receiptResult = await createReceiptRecord({
            purchaseType: 'booking',
            referenceId: booking.booking_id,
            customerId: booking.customer_id ?? user.customer_id ?? null,
            subtotal: subtotal,
            discount: 0,
            tax: taxAmount,
            total: totalAmount,
            paymentMethod: 'Credit Card (Square)',
            paymentId: paymentId,
            metadata: {
              bookingReference: reference,
              packageName,
              packageBasePrice,
              eventDate,
              startTime,
              location,
              guestCount,
              subtotal,
              taxAmount,
              taxRate: Math.round(getTaxRateSync() * 100),
              cleaningFee,
              extraChildren,
              extraAdults,
              addOns: formattedAddOns.length > 0 ? formattedAddOns : undefined,
              totalAmount,
              balanceRemaining,
              children: resolvedChildren.length > 0 ? resolvedChildren : undefined,
              notes: bookingNotes,
              customerPhone,
              packageDetails: partyPackage ? {
                priceUsd: partyPackage.price_usd ?? 0,
                baseChildren: partyPackage.base_children ?? 10,
                baseRoomHours: partyPackage.base_room_hours ?? 2,
                includesFood: partyPackage.includes_food ?? false,
                includesDrinks: partyPackage.includes_drinks ?? false,
                includesDecor: partyPackage.includes_decor ?? false,
                notes: partyPackage.notes ?? undefined,
                features: (partyPackage as any).features ?? [],
                additionalTerms: (partyPackage as any).additional_terms ?? [],
                extraChildPrice: (partyPackage as any).extra_child_price ?? 40,
                extraAdultPrice: (partyPackage as any).extra_adult_price ?? 10,
              } : undefined,
            },
          });
          receiptNumber = receiptResult.receiptNumber;

          // Generate PDF with package details
          receiptPdf = await generateBookingReceiptPDF({
            receiptNumber,
            date: orderDate,
            customerName: guestName,
            customerEmail: user.email ?? '',
            customerPhone,
            bookingReference: reference,
            packageName,
            packageBasePrice,
            eventDate,
            startTime,
            location,
            guestCount,
            subtotal,
            taxAmount,
            taxRate: Math.round(getTaxRateSync() * 100),
            cleaningFee,
            extraChildren,
            extraAdults,
            addOns: formattedAddOns.length > 0 ? formattedAddOns : undefined,
            depositAmount: totalAmount,
            balanceRemaining,
            total: totalAmount,
            paymentMethod: 'Credit Card (Square)',
            paymentId,
            children: resolvedChildren.length > 0 ? resolvedChildren : undefined,
            notes: bookingNotes,
            packageDetails: partyPackage ? {
              priceUsd: partyPackage.price_usd ?? 0,
              baseChildren: partyPackage.base_children ?? 10,
              baseRoomHours: partyPackage.base_room_hours ?? 2,
              includesFood: partyPackage.includes_food ?? false,
              includesDrinks: partyPackage.includes_drinks ?? false,
              includesDecor: partyPackage.includes_decor ?? false,
              notes: partyPackage.notes ?? undefined,
              features: (partyPackage as any).features ?? [],
              additionalTerms: (partyPackage as any).additional_terms ?? [],
              extraChildPrice: (partyPackage as any).extra_child_price ?? 40,
              extraAdultPrice: (partyPackage as any).extra_adult_price ?? 10,
            } : undefined,
          });
        } catch (receiptError) {
          console.error('Failed to generate booking receipt:', receiptError);
        }

        // Send booking confirmation email
        const emailData: BookingEmailData = {
          reference,
          guestName,
          email: user.email,
          eventDate,
          rawEventDate: booking.event_date ?? item.eventDate,
          startTime,
          location,
          packageName,
          packageBasePrice,
          guestCount,
          depositAmount: item.unitPrice,
          subtotal,
          cleaningFee,
          taxAmount,
          taxRate: Math.round(getTaxRateSync() * 100),
          totalAmount,
          balanceRemaining,
          extraChildren,
          extraAdults,
          addOns: formattedAddOns.length > 0 ? formattedAddOns : undefined,
          receiptPdf,
          receiptNumber,
          phone: customerPhone,
          children: resolvedChildren.length > 0 ? resolvedChildren : undefined,
          notes: bookingNotes,
          packageDetails: partyPackage ? {
            priceUsd: partyPackage.price_usd ?? 0,
            baseChildren: partyPackage.base_children ?? 10,
            baseRoomHours: partyPackage.base_room_hours ?? 2,
            includesFood: partyPackage.includes_food ?? false,
            includesDrinks: partyPackage.includes_drinks ?? false,
            includesDecor: partyPackage.includes_decor ?? false,
            notes: partyPackage.notes ?? undefined,
            features: (partyPackage as any).features ?? [],
            additionalTerms: (partyPackage as any).additional_terms ?? [],
            extraChildPrice: (partyPackage as any).extra_child_price ?? 40,
            extraAdultPrice: (partyPackage as any).extra_adult_price ?? 10,
          } : undefined,
        };

        await sendBookingConfirmation(emailData);

        // Send admin notification for booking
        try {
          await sendAdminBookingNotification({
            reference,
            customerName: guestName,
            customerEmail: user.email,
            customerPhone: user.phone ?? undefined,
            customerId: user.customer_id?.toString(),
            eventDate,
            startTime,
            location,
            packageName,
            guestCount,
            totalAmount,
            paymentId,
            paymentMethod: 'Credit Card (Square)',
            addOns: formattedAddOns.length > 0 ? formattedAddOns : undefined,
            notes: (item as { notes?: string }).notes,
            isGuestBooking: false,
          });
        } catch (adminEmailError) {
          console.error('Failed to send admin booking notification:', adminEmailError);
        }

        // Send SMS for booking
        if (user.phone) {
          try {
            const smsData: BookingSmsData = {
              phone: user.phone,
              guestName,
              reference,
              eventDate,
              startTime,
              location,
              packageName,
              guestCount,
              depositAmount: item.unitPrice, // Full payment - no deposit
              balanceRemaining,
            };
            await sendBookingConfirmationSms(smsData);
          } catch (smsError) {
            console.error('Failed to send booking SMS:', smsError);
          }
        }
      } catch (bookingEmailError) {
        console.error('Failed to send booking confirmation:', bookingEmailError);
      }
    }

    // Send order confirmation for tickets and other non-booking items
    const nonBookingLines = summary.lines.filter((_, idx) => !bookingResults.some(b => b.cartIndex === idx));

    if (nonBookingLines.length > 0) {
      // Build items for email/receipt (exclude bookings)
      const emailItems = nonBookingLines.map((line, _idx) => {
        const originalIdx = summary.lines.indexOf(line);
        const ticketResult = ticketResults.find(t => t.cartIndex === originalIdx);
        const ticketData = ticketResult?.ticket as { codes?: Array<{ code: string }> } | undefined;
        return {
          label: line.label,
          quantity: line.quantity,
          unitPrice: line.unitPrice,
          total: line.total,
          codes: ticketData?.codes?.map(c => c.code),
        };
      });

      const nonBookingSubtotal = nonBookingLines.reduce((sum, l) => sum + l.subtotal, 0);
      const nonBookingDiscount = summary.discounts.reduce((sum, d) => sum + d.amount, 0);
      // Calculate tax only on non-booking items (bookings have their own tax in booking.total)
      const nonBookingTax = roundCurrency(nonBookingSubtotal * getTaxRateSync());
      const nonBookingTotal = roundCurrency(nonBookingSubtotal - nonBookingDiscount + nonBookingTax);

      // Create receipt record for ticket/membership purchases
      let ticketReceiptNumber = orderNumber;
      if (ticketResults.length > 0 || membershipResults.length > 0) {
        try {
          const firstTicket = ticketResults[0]?.ticket as { orderId?: number } | undefined;
          const referenceId = firstTicket?.orderId ?? user.customer_id ?? Date.now();
          const receiptResult = await createReceiptRecord({
            purchaseType: 'ticket',
            referenceId,
            customerId: user.customer_id ?? undefined,
            subtotal: nonBookingSubtotal,
            discount: nonBookingDiscount,
            tax: nonBookingTax,
            total: nonBookingTotal,
            paymentMethod: 'Credit Card (Square)',
            paymentId,
            metadata: {
              items: emailItems,
              discounts: summary.discounts,
            },
          });
          ticketReceiptNumber = receiptResult.receiptNumber;
        } catch (receiptError) {
          console.error('Failed to create ticket receipt record:', receiptError);
        }
      }

      try {
        // Generate PDF receipt for non-booking items
        // Bug fix #4: Use nonBookingTax (not summary.taxAmount which includes all items)
        const receiptPdf = await generateReceiptPDF({
          receiptNumber: ticketReceiptNumber,
          date: orderDate,
          customerName: `${user.first_name ?? ''} ${user.last_name ?? ''}`.trim() || 'Customer',
          customerEmail: user.email,
          items: emailItems,
          subtotal: nonBookingSubtotal,
          taxAmount: nonBookingTax,
          discounts: summary.discounts,
          total: nonBookingTotal,
          paymentMethod: 'Credit Card (Square)',
          paymentId,
        });

        // Send confirmation email for non-booking items
        await sendOrderConfirmation({
          email: user.email,
          customerName: user.first_name ?? 'Customer',
          orderNumber: ticketReceiptNumber,
          orderDate,
          items: emailItems,
          subtotal: nonBookingSubtotal,
          taxAmount: nonBookingTax,
          discounts: summary.discounts,
          total: nonBookingTotal,
          paymentMethod: 'Credit Card (Square)',
          receiptPdf,
        });

        // Send admin notification for ticket orders
        if (ticketResults.length > 0) {
          try {
            const adminTicketItems = ticketResults.map(t => {
              const ticket = t.ticket as { codes?: Array<{ code: string }> };
              const line = summary.lines[t.cartIndex];
              return {
                label: line?.label ?? 'Ticket',
                quantity: line?.quantity ?? 1,
                unitPrice: line?.unitPrice ?? 0,
                codes: ticket?.codes?.map(c => c.code) ?? [],
              };
            });

            await sendAdminTicketNotification({
              orderNumber: ticketReceiptNumber,
              customerName: `${user.first_name ?? ''} ${user.last_name ?? ''}`.trim() || 'Customer',
              customerEmail: user.email,
              customerPhone: user.phone ?? undefined,
              customerId: user.customer_id?.toString(),
              tickets: adminTicketItems,
              subtotal: nonBookingSubtotal,
              taxAmount: nonBookingTax,
              totalAmount: nonBookingTotal,
              discounts: summary.discounts,
              paymentId,
              paymentMethod: 'Credit Card (Square)',
              purchaseDate: orderDate,
              isGuestPurchase: false,
            });
          } catch (adminEmailError) {
            console.error('Failed to send admin ticket notification:', adminEmailError);
          }
        }

        // Send admin notification for membership purchases
        if (membershipResults.length > 0) {
          for (const membershipResult of membershipResults) {
            try {
              const membership = membershipResult.membership as {
                tierName?: string;
                startedAt?: string;
                expiresAt?: string;
                visitsPerMonth?: number | null;
                monthlyPrice?: number;
                autoRenew?: boolean;
              };
              const line = summary.lines[membershipResult.cartIndex];

              await sendAdminMembershipNotification({
                customerName: `${user.first_name ?? ''} ${user.last_name ?? ''}`.trim() || 'Customer',
                customerEmail: user.email,
                customerPhone: user.phone ?? undefined,
                customerId: user.customer_id?.toString(),
                tierName: membership.tierName ?? line?.label ?? 'Membership',
                startDate: membership.startedAt ? ((s: string) => { const d = s.slice(0, 10).split('-'); return new Date(Number(d[0]), Number(d[1]) - 1, Number(d[2])).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }); })(membership.startedAt) : orderDate,
                expiryDate: membership.expiresAt ? ((s: string) => { const d = s.slice(0, 10).split('-'); return new Date(Number(d[0]), Number(d[1]) - 1, Number(d[2])).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }); })(membership.expiresAt) : 'N/A',
                visitsPerMonth: membership.visitsPerMonth ?? null,
                monthlyPrice: membership.monthlyPrice ?? line?.unitPrice ?? 0,
                totalPaid: roundCurrency((line?.total ?? 0) * (1 + getTaxRateSync())),
                durationMonths: (line?.metadata as { durationMonths?: number })?.durationMonths ?? 1,
                autoRenew: membership.autoRenew ?? false,
                paymentId,
                paymentMethod: 'Credit Card (Square)',
                isGuestPurchase: false,
              });
            } catch (adminEmailError) {
              console.error('Failed to send admin membership notification:', adminEmailError);
            }
          }
        }
      } catch (emailError) {
        console.error('Failed to send order confirmation email:', emailError);
        // Don't fail the checkout if email fails
      }
    }

    // Send SMS notification
    if (user.phone) {
      try {
        const ticketItems = ticketResults.map(t => {
          const ticket = t.ticket as { codes?: Array<{ code: string }> };
          const line = summary.lines[t.cartIndex];
          return {
            label: line?.label ?? 'Ticket',
            quantity: line?.quantity ?? 1,
            codes: ticket?.codes?.map(c => c.code) ?? [],
          };
        });

        if (ticketItems.length > 0) {
          await sendTicketConfirmationSms({
            phone: user.phone,
            customerName: user.first_name ?? 'Customer',
            tickets: ticketItems,
            totalAmount: summary.total,
          });
        } else {
          await sendOrderConfirmationSms({
            phone: user.phone,
            customerName: user.first_name ?? 'Customer',
            orderNumber,
            total: summary.total,
            itemCount: summary.lines.length,
          });
        }
      } catch (smsError) {
        console.error('Failed to send order confirmation SMS:', smsError);
      }
    }
}

/**
 * Create guest checkout intent
 */
export async function createSquareGuestCheckoutPaymentIntent(input: SquareGuestCheckoutIntentInput) {
  // Membership purchases require an authenticated account
  if (input.items.some(item => item.type === 'membership')) {
    throw new AppError('Membership purchases require an account. Please sign in or create an account first.', 400);
  }

  const { summary } = await buildGuestSummary(input.items, input.promoCode);

  if (summary.total <= 0) {
    throw new AppError('No payment is required for this cart', 400);
  }

  return {
    amount: summary.total,
    currency: 'usd',
    summary,
    promoCode: input.promoCode,
  };
}

/**
 * Finalize guest checkout with Square payment
 *
 * INDUSTRY-STANDARD E-COMMERCE CHECKOUT FLOW (GUEST):
 * 1. Validate all items (availability, pricing)
 * 2. Create/find guest customer
 * 3. Create order record (status: Pending)
 * 4. Process payment
 * 5. Fulfill items
 * 6. Update order status
 * 7. Send notifications (async)
 */
export async function finalizeSquareGuestCheckout(input: SquareGuestCheckoutFinalizeInput) {
  assertSquareConfigured();

  // Membership purchases require an authenticated account
  if (input.items.some(item => item.type === 'membership')) {
    throw new AppError('Membership purchases require an account. Please sign in or create an account first.', 400);
  }

  // PHASE 0: PRICE VALIDATION (Critical Security Check)
  // Validate all prices against database before processing payment
  await validateItemPrices(input.items);

  const { summary, coupon } = await buildGuestSummary(input.items, input.promoCode);

  if (summary.total <= 0) {
    throw new AppError('No payment is required for this cart', 400);
  }

  // Fix #7 & #19: Validate payment amount is within Square's limits
  if (summary.total < PAYMENT_LIMITS.MIN_USD) {
    throw new AppError(`Minimum payment amount is $${PAYMENT_LIMITS.MIN_USD.toFixed(2)}`, 400);
  }
  if (summary.total > PAYMENT_LIMITS.MAX_USD) {
    throw new AppError(`Payment amount exceeds the maximum of $${PAYMENT_LIMITS.MAX_USD.toFixed(2)}`, 400);
  }

  // ============================================================
  // PHASE 1: PRE-VALIDATION & SLOT RESERVATION (Before any payment)
  // ============================================================
  // Session ID ties reservations to this guest checkout attempt
  // SECURITY: Use hash of full sourceId to prevent collision attacks
  const sessionId = `guest_checkout_${input.guestEmail}_${hashSourceId(input.sourceId)}`;
  const slotReservations: Map<number, string> = new Map(); // itemIndex -> reservationId

  for (const [itemIndex, item] of input.items.entries()) {
    if (item.type === 'booking') {
      const packageId = parseInt(item.packageId, 10);
      const partyPackage = await PartyPackageRepository.findById(packageId);
      if (!partyPackage) {
        throw new AppError(`Party package not found: ${item.label}`, 400);
      }

      // SECURITY: Validate that booking date/time is in the future
      const eventDate = DateTime.fromISO(item.eventDate, { zone: 'America/New_York' });
      const [hour, minute] = item.startTime.split(':').map(Number);
      const startDateTime = eventDate.set({ hour, minute, second: 0, millisecond: 0 });

      if (startDateTime <= DateTime.now().setZone('America/New_York')) {
        throw new AppError(
          `Cannot book a party in the past. Please select a future date and time.`,
          400
        );
      }

      // Check if frontend already reserved the slot (passed reservationId)
      // This prevents double-reservation when frontend reserves before calling finalize
      if (input.reservationId) {
        // Validate the existing reservation
        const existingReservation = await getReservation(input.reservationId);
        if (!existingReservation) {
          throw new AppError('Reservation not found. Please try again.', 404);
        }
        if (existingReservation.status === 'expired') {
          throw new AppError('Your reservation has expired. Please select the time slot again.', 410);
        }
        if (existingReservation.status === 'cancelled') {
          throw new AppError('Reservation was cancelled. Please try again.', 410);
        }
        if (existingReservation.status !== 'pending' && existingReservation.status !== 'confirmed') {
          throw new AppError(`Invalid reservation status: ${existingReservation.status}`, 400);
        }
        // Validate that reservation matches the booking item
        // Fix #10: Use robust time normalization for comparison
        const reservationTime = normalizeTime(existingReservation.slot_time);
        const itemTime = normalizeTime(item.startTime);
        if (existingReservation.slot_date !== item.eventDate ||
            reservationTime !== itemTime ||
            existingReservation.location_name !== item.location) {
          logger.warn({
            reservationId: input.reservationId,
            reservation: { date: existingReservation.slot_date, time: existingReservation.slot_time, location: existingReservation.location_name },
            item: { date: item.eventDate, time: item.startTime, location: item.location },
          }, 'Reservation mismatch detected');
          throw new AppError('Reservation does not match the booking details.', 400);
        }
        // Check if reservation is still valid (not expired by time)
        if (new Date(existingReservation.expires_at) < new Date()) {
          throw new AppError('Your reservation has expired. Please select the time slot again.', 410);
        }
        slotReservations.set(itemIndex, input.reservationId);
        logger.info({
          reservationId: input.reservationId,
          eventDate: item.eventDate,
          startTime: item.startTime,
          location: item.location,
        }, 'Using existing frontend reservation for guest checkout');
      } else {
        // No reservationId provided - create new reservation
        // SECURITY: Atomically reserve the slot to prevent double-booking race conditions
        // The reservation expires in 5 minutes if payment doesn't complete
        try {
          const reservation = await reserveSlot(
            item.eventDate,
            item.startTime,
            item.location,
            null, // Guest user - no user ID
            sessionId
          );
          slotReservations.set(itemIndex, reservation.reservationId);
          logger.info({
            reservationId: reservation.reservationId,
            eventDate: item.eventDate,
            startTime: item.startTime,
            location: item.location,
            expiresAt: reservation.expiresAt,
          }, 'Slot reserved for guest checkout');
        } catch (err) {
          // Slot is no longer available - another user reserved it
          if (err instanceof AppError && err.statusCode === 409) {
            throw new AppError(
              `The time slot ${item.startTime} on ${item.eventDate} at ${item.location} is no longer available.`,
              409
            );
          }
          throw err;
        }
      }
    }
  }

  // ============================================================
  // PHASE 2: CREATE/FIND GUEST CUSTOMER
  // ============================================================
  const guestCustomer = await CustomerRepository.findOrCreateGuest({
    firstName: input.guestFirstName,
    lastName: input.guestLastName,
    email: input.guestEmail,
    phone: input.guestPhone,
  });

  // ============================================================
  // PHASE 3: CREATE ORDER
  // ============================================================
  const order = await OrderRepository.create({
    customer_id: guestCustomer.customer_id,
    order_type: 'Mixed',
    status: 'Pending',
    subtotal_usd: summary.subtotal,
    discount_usd: summary.discounts.reduce((sum, d) => sum + d.amount, 0),
    tax_usd: summary.taxAmount,
    total_usd: summary.total,
    notes: buildSquarePaymentNote(input.items),
    promotion_id: coupon?.promotionId ?? null,
    coupon_code: coupon?.code ?? null,
  });

  logger.info({
    orderId: order.order_id,
    guestEmail: input.guestEmail,
    customerId: guestCustomer.customer_id,
    subtotal: summary.subtotal,
    tax: summary.taxAmount,
    total: summary.total,
    itemCount: input.items.length,
    items: input.items.map(i => ({ type: i.type, label: i.label, unitPrice: i.unitPrice })),
  }, 'Guest order created (Pending) — starting payment');

  // SECURITY: Use hash of full sourceId to prevent collision attacks
  const idempotencyKey = `guest_checkout_${order.order_id}_${hashSourceId(input.sourceId)}`;

  let paymentId: string;
  let receiptUrl: string | null | undefined = null;

  // ============================================================
  // PHASE 4: PROCESS PAYMENT
  // ============================================================
  const guestPaymentStartTime = Date.now();
  const guestLogResult = await logPaymentInitiated({
    idempotencyKey,
    customerId: guestCustomer.customer_id,
    paymentType: 'checkout',
    amount: summary.total,
    referenceId: `guest_order_${order.order_id}`,
    metadata: { orderId: order.order_id, itemCount: input.items.length, guestEmail: input.guestEmail, checkoutSessionId: input.checkoutSessionId ?? null },
  }, {
    sourceId: input.sourceId,
    idempotencyKey,
    amountMoney: toSquareMoney(summary.total),
    locationId: getSquareLocationId(),
  } as CreatePaymentRequest);

  try {
    {
      const square = getSquareClient();
      const locationId = getSquareLocationId();

      const paymentRequest: CreatePaymentRequest = {
        sourceId: input.sourceId,
        idempotencyKey,
        amountMoney: toSquareMoney(summary.total),
        locationId,
        referenceId: `guest_order_${order.order_id}`,
        note: buildSquarePaymentNote(input.items),
        buyerEmailAddress: input.guestEmail,
        autocomplete: true,
      };

      if (input.verificationToken) {
        paymentRequest.verificationToken = input.verificationToken;
      }

      // Fix #15: Add retry logic for transient errors
      const response = await withRetry(
        () => square.payments.create(paymentRequest),
        { maxRetries: 3, operationName: 'squareGuestPaymentCreate' }
      );

      // Fix #4: Accept both COMPLETED and PENDING statuses
      if (!response.payment || !VALID_PAYMENT_STATUSES.includes(response.payment.status ?? '')) {
        logger.warn({ orderId: order.order_id, paymentStatus: response.payment?.status, elapsed: Date.now() - guestPaymentStartTime }, 'Guest order Failed — invalid payment status');
        await OrderRepository.update(order.order_id, { status: 'Failed' });
        await logPaymentFailed(guestLogResult, [{ category: 'PAYMENT_METHOD_ERROR', code: response.payment?.status ?? 'UNKNOWN', detail: 'Invalid payment status' }], Date.now() - guestPaymentStartTime);
        throw new AppError('Payment failed. Please try again.', 400);
      }

      const payment = response.payment;
      if (!payment.id) {
        logger.warn({ orderId: order.order_id, elapsed: Date.now() - guestPaymentStartTime }, 'Guest order Failed — missing payment ID');
        await OrderRepository.update(order.order_id, { status: 'Failed' });
        await logPaymentFailed(guestLogResult, [{ category: 'API_ERROR', code: 'MISSING_PAYMENT_ID', detail: 'Payment response missing ID' }], Date.now() - guestPaymentStartTime);
        throw new AppError('Payment processing error. Please try again.', 500);
      }
      paymentId = payment.id;
      receiptUrl = payment.receiptUrl;

      await logPaymentCompleted(guestLogResult, payment, Date.now() - guestPaymentStartTime);
      logger.info({ orderId: order.order_id, paymentId, paymentStatus: payment.status, total: summary.total, elapsed: Date.now() - guestPaymentStartTime }, 'Guest payment successful — fulfilling order');

      // Record payment with receipt URL (Fix #16)
      await PaymentRepository.create({
        order_id: order.order_id,
        provider: 'square',
        provider_payment_id: paymentId,
        amount_usd: summary.total,
        status: payment.status === 'PENDING' ? 'Pending' : 'Captured',
        receipt_url: payment.receiptUrl ?? null,
      });
    }
  } catch (paymentError) {
    await OrderRepository.update(order.order_id, { status: 'Failed' });

    // Convert Square API errors (e.g., invalid card, declined) to user-friendly messages
    if (paymentError && typeof paymentError === 'object' && !(paymentError instanceof AppError)) {
      const obj = paymentError as Record<string, unknown>;
      if ('statusCode' in obj && 'errors' in obj && Array.isArray(obj.errors)) {
        const statusCode = obj.statusCode as number;
        const errors = obj.errors as Array<{ code?: string; category?: string; detail?: string; field?: string }>;
        await logPaymentFailed(guestLogResult, errors as SquareError[], Date.now() - guestPaymentStartTime, obj);
        logger.error({ orderId: order.order_id, errorCode: errors[0]?.code, errorCategory: errors[0]?.category, errorDetail: errors[0]?.detail, total: summary.total, elapsed: Date.now() - guestPaymentStartTime }, 'Guest order Failed — payment declined');
        if (statusCode >= 400 && statusCode < 500 && errors[0]?.code) {
          throw new AppError(getUserFriendlyErrorMessage(errors[0].code), 400);
        }
      }
    }
    throw paymentError;
  }

  // ============================================================
  // PHASE 5: FULFILL ITEMS
  // ============================================================
  await OrderRepository.update(order.order_id, { status: 'Processing' });

  const ticketResults: Array<{ cartIndex: number; ticket: unknown }> = [];
  const bookingResults: Array<{ cartIndex: number; booking: unknown; item: SquareCheckoutItemInput }> = [];
  const guestGuardianId = `customer_${guestCustomer.customer_id}`;
  const fulfillmentErrors: string[] = [];

  for (const [index, item] of input.items.entries()) {
    const line = summary.lines[index];
    if (!line) continue;

    try {
      if (item.type === 'ticket') {
        const pricePerTicket = line.quantity > 0 ? roundCurrency(line.total / line.quantity) : item.unitPrice;
        const ticket = await reserveTickets({
          guardianId: guestGuardianId,
          customerId: guestCustomer.customer_id,
          type: item.eventId ? 'event' : 'general',
          eventId: item.eventId,
          quantity: item.quantity,
          price: pricePerTicket,
          metadata: {
            ...(item.metadata ?? {}),
            label: item.label,
            orderId: order.order_id,
            promoCode: input.promoCode,
            discounts: line.discounts,
          },
        });
        ticketResults.push({ cartIndex: index, ticket });
      }

      if (item.type === 'booking') {
        const packageId = parseInt(item.packageId, 10);
        const partyPackage = await PartyPackageRepository.findById(packageId);
        if (!partyPackage) {
          fulfillmentErrors.push(`Booking ${index}: Package not found`);
          continue;
        }

        const eventDate = DateTime.fromISO(item.eventDate, { zone: 'America/New_York' });
        const [hour, minute] = item.startTime.split(':').map(Number);
        const startDateTime = eventDate.set({ hour, minute, second: 0, millisecond: 0 });
        const baseDuration = (partyPackage.base_room_hours ?? 2) * 60;
        const hasExtraHour = (item.addOns ?? []).some(
          (a: any) => a.id === 'extra_hour' || a.productName?.toLowerCase().includes('extra hour')
        );
        const totalPartyMinutes = baseDuration + (hasExtraHour ? 60 : 0);
        const endDateTime = startDateTime.plus({ minutes: totalPartyMinutes });
        const scheduledEndDateTime = endDateTime.plus({ minutes: 30 }); // cleaning buffer

        const reference = `BK-${DateTime.now().toFormat('yyyyLLddHHmm')}-${randomUUID().slice(0, 8).toUpperCase()}`;
        // Use per-package cleaning fee if set, otherwise global
        const guestGlobalCleaningFee = await getPricingCleaningFee();
        const cleaningFee = (partyPackage as any).cleaning_fee != null ? Number((partyPackage as any).cleaning_fee) : guestGlobalCleaningFee;

        // SECURITY: Validate that subtotal is non-negative after subtracting cleaning fee
        // This prevents price manipulation attacks where cleaningFee > unitPrice
        const guestBookingSubtotal = item.unitPrice - cleaningFee;
        if (guestBookingSubtotal < 0) {
          throw new AppError(
            'Invalid booking price: unit price cannot be less than cleaning fee. Please refresh and try again.',
            400
          );
        }

        // Calculate tax using cents-based math for consistency with summary-level calculation
        const taxRate = getTaxRateSync();
        const unitPriceCents = dollarsToCents(item.unitPrice);
        const taxAmountCents = calculateTaxCents(unitPriceCents, taxRate);
        const taxAmount = centsToDollars(taxAmountCents);
        const totalWithTax = centsToDollars(unitPriceCents + taxAmountCents);

        // Build child info from guestInfo for storage
        const guestChildIds: number[] = [];
        if (item.guestInfo) {
          try {
            // Create child record for birthday child
            const birthdayChild = await ChildRepository.create({
              customer_id: guestCustomer.customer_id,
              first_name: item.guestInfo.childName,
              birth_date: item.guestInfo.childBirthDate || undefined,
            });
            guestChildIds.push(birthdayChild.child_id);

            // Create records for additional children
            if (item.guestInfo.additionalChildren?.length) {
              for (const ac of item.guestInfo.additionalChildren) {
                const child = await ChildRepository.create({
                  customer_id: guestCustomer.customer_id,
                  first_name: ac.name,
                  birth_date: ac.birthDate || undefined,
                });
                guestChildIds.push(child.child_id);
              }
            }
          } catch (childErr) {
            logger.warn({ err: childErr }, 'Failed to create child records for guest booking');
          }
        }

        // Create booking
        // Note: Tax is calculated using (subtotal + cleaningFee) * taxRate at receipt time
        // The total already includes tax for proper payment amount
        const booking = await PartyBookingRepository.create({
          package_id: packageId,
          customer_id: guestCustomer.customer_id,
          scheduled_start: startDateTime.toISO() ?? startDateTime.toJSDate().toISOString(),
          scheduled_end: scheduledEndDateTime.toISO() ?? scheduledEndDateTime.toJSDate().toISOString(),
          reference,
          location_name: item.location,
          event_date: item.eventDate,
          start_time: item.startTime,
          end_time: endDateTime.toFormat('HH:mm'),
          guests: item.guestCount,
          notes: item.notes,
          add_ons: item.addOns ?? [],
          subtotal: guestBookingSubtotal,
          cleaning_fee: cleaningFee,
          total: totalWithTax,
          deposit_amount: totalWithTax,
          balance_remaining: 0,
          payment_status: PAYMENT_STATUS.PAID,
          status: 'Confirmed',
          child_ids: guestChildIds,
          guest_name: `${input.guestFirstName} ${input.guestLastName}`,
          guest_email: input.guestEmail,
          guest_phone: input.guestPhone,
        });

        // SECURITY: Confirm the slot reservation now that booking is created
        // This permanently locks the slot and links it to the booking
        const reservationId = slotReservations.get(index);
        if (reservationId) {
          try {
            await confirmReservation(reservationId, booking.booking_id);
            logger.info({ reservationId, bookingId: booking.booking_id }, 'Guest slot reservation confirmed');
          } catch (confirmErr) {
            // Log but don't fail - booking is created, reservation will expire naturally
            logger.error({ error: confirmErr, reservationId, bookingId: booking.booking_id }, 'Failed to confirm guest reservation');
          }
        }

        bookingResults.push({ cartIndex: index, booking, item });
      }
    } catch (fulfillError) {
      const errorMsg = fulfillError instanceof Error ? fulfillError.message : 'Unknown error';
      fulfillmentErrors.push(`Item ${index} (${item.type}): ${errorMsg}`);
      console.error(`Guest fulfillment error for item ${index}:`, fulfillError);
    }
  }

  // ============================================================
  // PHASE 5.5: HANDLE PARTIAL FULFILLMENT (Automatic Refund)
  // ============================================================
  let guestPartialRefundIssued = false;
  let guestPartialRefundAmount = 0;

  if (fulfillmentErrors.length > 0) {
    // Calculate refund amount for unfulfilled items
    const fulfilledIndices = new Set([
      ...ticketResults.map(t => t.cartIndex),
      ...bookingResults.map(b => b.cartIndex),
    ]);

    const unfulfilledLines = summary.lines.filter((_, idx) => !fulfilledIndices.has(idx));
    // Bug fix #1: Include proportional tax in refund amount (line totals are pre-tax)
    const unfulfilledSubtotal = unfulfilledLines.reduce((sum, line) => sum + line.total, 0);
    const unfulfilledTax = roundCurrency(unfulfilledSubtotal * getTaxRateSync());
    const unfulfilledAmount = roundCurrency(unfulfilledSubtotal + unfulfilledTax);

    if (unfulfilledAmount > 0) {
      try {
        const square = getSquareClient();

        const refundResponse = await square.refunds.refundPayment({
          paymentId,
          idempotencyKey: `refund_guest_${order.order_id}_partial_${hashSourceId(paymentId)}`,
          amountMoney: toSquareMoney(unfulfilledAmount),
          reason: 'PARTIAL_FULFILLMENT_FAILURE',
        });

        if (refundResponse.refund?.status === 'COMPLETED' || refundResponse.refund?.status === 'PENDING') {
          guestPartialRefundIssued = true;
          guestPartialRefundAmount = unfulfilledAmount;
          logger.info({
            orderId: order.order_id,
            refundId: refundResponse.refund.id,
            amount: unfulfilledAmount,
            unfulfilledItems: unfulfilledLines.map(l => l.label),
          }, 'Guest partial refund issued for unfulfilled items');
        }
      } catch (refundError) {
        logger.error({
          error: refundError,
          orderId: order.order_id,
          paymentId,
          amount: unfulfilledAmount,
          fulfillmentErrors,
        }, 'Guest partial refund failed - requires manual intervention');
      }
    }
  }

  // ============================================================
  // PHASE 6: UPDATE ORDER STATUS
  // ============================================================
  const finalStatus = fulfillmentErrors.length > 0 ? 'Partial' : 'Completed';
  const guestOrderNotes = fulfillmentErrors.length > 0
    ? `Guest checkout - Fulfillment issues: ${fulfillmentErrors.join('; ')}${guestPartialRefundIssued ? ` | Refund issued: $${guestPartialRefundAmount.toFixed(2)}` : ' | Refund may be required'}`
    : undefined;

  await OrderRepository.update(order.order_id, {
    status: finalStatus,
    notes: guestOrderNotes,
  });

  // Bump coupon redemption counter (best effort)
  if (coupon) {
    try {
      await PromotionRepository.incrementRedemptions(coupon.promotionId);
    } catch (err) {
      logger.warn({ err, promotionId: coupon.promotionId, orderId: order.order_id }, 'Failed to increment coupon redemptions (guest)');
    }
  }

  // Mark any associated checkout session as completed
  if (input.checkoutSessionId) {
    completeCheckoutSession(input.checkoutSessionId, order.order_id).catch(err =>
      logger.error({ error: err, checkoutSessionId: input.checkoutSessionId, orderId: order.order_id }, 'Failed to complete guest checkout session')
    );
  }

  // ============================================================
  // PHASE 7: SEND NOTIFICATIONS (Async - Non-blocking)
  // ============================================================
  const orderNumber = `PF-${order.order_id}`;
  const orderDate = new Date().toLocaleString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: 'America/New_York',
  });

  // Fire-and-forget notifications
  setImmediate(async () => {
    try {
      await sendGuestNotifications({
        input,
        guestCustomer,
        orderNumber,
        orderDate,
        summary,
        paymentId,
        ticketResults,
        bookingResults,
      });
    } catch (notificationError) {
      console.error('Guest notification error:', notificationError);
    }
  });

  return {
    paymentId,
    summary,
    tickets: ticketResults,
    memberships: [],
    bookings: bookingResults.map(b => ({
      cartIndex: b.cartIndex,
      bookingId: String((b.booking as { booking_id: number }).booking_id),
      reference: (b.booking as { reference: string }).reference,
    })),
    receiptEmail: input.guestEmail,
    receiptUrl,
  };
}

/**
 * Send notifications for guest checkout (async helper)
 */
async function sendGuestNotifications(params: {
  input: SquareGuestCheckoutFinalizeInput;
  guestCustomer: { customer_id: number };
  orderNumber: string;
  orderDate: string;
  summary: SquareCheckoutSummary;
  paymentId: string;
  ticketResults: Array<{ cartIndex: number; ticket: unknown }>;
  bookingResults: Array<{ cartIndex: number; booking: unknown; item: SquareCheckoutItemInput }>;
}) {
  const { input, guestCustomer, orderNumber, orderDate, summary, paymentId, ticketResults, bookingResults } = params;

  // Send booking confirmation emails for guest party bookings
  for (const bookingResult of bookingResults) {
    try {
      const booking = bookingResult.booking as {
        booking_id: number;
        reference?: string;
        event_date?: string;
        start_time?: string;
        location_name?: string;
        guests?: number;
        total?: number;
        deposit_amount?: number;
        balance_remaining?: number;
        package_id?: number;
        add_ons?: unknown;
        subtotal?: number;
        cleaning_fee?: number;
        customer_id?: number;
        child_ids?: number[];
        notes?: string;
      };
      const item = bookingResult.item as { type: 'booking'; packageId: string; unitPrice: number; guestCount: number; eventDate: string; startTime: string; label: string; location: string };

      // Get package details
      const packageId = parseInt(item.packageId, 10);
      const partyPackage = await PartyPackageRepository.findById(packageId);
      const packageName = partyPackage?.name ?? item.label;

      const reference = booking.reference ?? `PF-${booking.booking_id}`;
      const guestName = `${input.guestFirstName} ${input.guestLastName}`;
      const eventDate = booking.event_date
        ? (() => { const p = booking.event_date.split('-'); return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2])).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }); })()
        : item.eventDate;
      const startTime = booking.start_time ?? item.startTime;
      const location = booking.location_name ?? 'Albany';
      const guestCount = booking.guests ?? item.guestCount;
      const totalAmount = booking.total ?? item.unitPrice;
      const depositPaid = booking.deposit_amount ?? item.unitPrice;
      const balanceRemaining = booking.balance_remaining ?? 0;
      const subtotal = booking.subtotal ?? 0;
      const cleaningFee = booking.cleaning_fee ?? 0;
      const packageBasePrice = partyPackage?.price_usd ?? 0;
      // Calculate tax from stored subtotal and cleaning fee using centralized tax rate
      const taxableAmount = subtotal + cleaningFee;
      const taxAmount = centsToDollars(calculateTaxCents(dollarsToCents(taxableAmount), getTaxRateSync()));

      // Parse add-ons to extract extra children and extra adults
      const addOnsArray = (booking.add_ons ?? []) as Array<{ id?: string; label?: string; name?: string; price: number; quantity: number }>;
      const extraChildAddOn = addOnsArray.find(a => a.id === 'extra_child' || a.name === 'Extra Child');
      const extraAdultAddOn = addOnsArray.find(a => a.id === 'extra_adult' || a.name === 'Extra Adult');

      // Extract counts from add-ons (preferred) or calculate from guest count
      const maxGuests = partyPackage?.base_children ?? 10;
      const extraChildrenCount = extraChildAddOn?.quantity ?? Math.max(0, guestCount - maxGuests);
      const extraAdultsCount = extraAdultAddOn?.quantity ?? 0;

      // Use stored price from add-on, or fetch from pricing config service
      const extraChildUnitPrice = extraChildAddOn?.price ?? await getExtraChildFee();
      const extraAdultUnitPrice = extraAdultAddOn?.price ?? await getExtraAdultFee();

      // Build extra children/adults data
      const extraChildren = extraChildrenCount > 0 ? {
        count: extraChildrenCount,
        unitPrice: extraChildUnitPrice,
        total: extraChildrenCount * extraChildUnitPrice,
      } : undefined;

      const extraAdults = extraAdultsCount > 0 ? {
        count: extraAdultsCount,
        unitPrice: extraAdultUnitPrice,
        total: extraAdultsCount * extraAdultUnitPrice,
      } : undefined;

      // Filter out extra_child and extra_adult from add-ons
      const addOns = addOnsArray.filter(a =>
        a.id !== 'extra_child' && a.id !== 'extra_adult' &&
        a.name !== 'Extra Child' && a.name !== 'Extra Adult'
      );
      const formattedAddOns = addOns.map(a => ({
        name: a.label ?? a.name ?? 'Add-on',
        price: a.price,
        quantity: a.quantity ?? 1,
      }));

      // Resolve children from DB for email/PDF
      const guestBookingChildIds = (booking.child_ids ?? []) as number[];
      let guestResolvedChildren: Array<{ name: string; birthDate?: string }> = [];
      if (guestBookingChildIds.length > 0) {
        try {
          const childRecords = await ChildRepository.findByIds(guestBookingChildIds);
          guestResolvedChildren = childRecords.map((c: any) => ({
            name: `${c.first_name || ''} ${c.last_name || ''}`.trim(),
            birthDate: c.birth_date || undefined,
          }));
        } catch (childErr) {
          console.error('Failed to resolve children for guest receipt:', childErr);
        }
      }
      const guestBookingNotes = booking.notes?.toString() || undefined;
      const guestPhone = input.guestPhone ?? undefined;

      // Generate receipt
      let receiptNumber: string | undefined;
      let receiptPdf: Buffer | undefined;

      try {
        const receiptResult = await createReceiptRecord({
          purchaseType: 'booking',
          referenceId: booking.booking_id,
          customerId: booking.customer_id ?? guestCustomer.customer_id ?? null,
          subtotal,
          discount: 0,
          tax: taxAmount,
          total: totalAmount,
          paymentMethod: 'Credit Card (Square)',
          paymentId: paymentId,
          metadata: {
            bookingReference: reference,
            packageName,
            packageBasePrice,
            eventDate,
            startTime,
            location,
            guestCount,
            subtotal,
            taxAmount,
            taxRate: Math.round(getTaxRateSync() * 100),
            cleaningFee,
            extraChildren,
            extraAdults,
            addOns: formattedAddOns.length > 0 ? formattedAddOns : undefined,
            totalAmount,
            balanceRemaining,
            children: guestResolvedChildren.length > 0 ? guestResolvedChildren : undefined,
            notes: guestBookingNotes,
            customerPhone: guestPhone,
            packageDetails: partyPackage ? {
              priceUsd: partyPackage.price_usd ?? 0,
              baseChildren: partyPackage.base_children ?? 10,
              baseRoomHours: partyPackage.base_room_hours ?? 2,
              includesFood: partyPackage.includes_food ?? false,
              includesDrinks: partyPackage.includes_drinks ?? false,
              includesDecor: partyPackage.includes_decor ?? false,
              notes: partyPackage.notes ?? undefined,
              features: (partyPackage as any).features ?? [],
              additionalTerms: (partyPackage as any).additional_terms ?? [],
              extraChildPrice: (partyPackage as any).extra_child_price ?? 40,
              extraAdultPrice: (partyPackage as any).extra_adult_price ?? 10,
            } : undefined,
          },
        });
        receiptNumber = receiptResult.receiptNumber;

        // Generate PDF with package details
        receiptPdf = await generateBookingReceiptPDF({
          receiptNumber,
          date: orderDate,
          customerName: guestName,
          customerEmail: input.guestEmail,
          customerPhone: guestPhone,
          bookingReference: reference,
          packageName,
          packageBasePrice,
          eventDate,
          startTime,
          location,
          guestCount,
          subtotal,
          taxAmount,
          taxRate: Math.round(getTaxRateSync() * 100),
          cleaningFee,
          extraChildren,
          extraAdults,
          addOns: formattedAddOns.length > 0 ? formattedAddOns : undefined,
          depositAmount: totalAmount,
          balanceRemaining,
          total: totalAmount,
          paymentMethod: 'Credit Card (Square)',
          paymentId,
          children: guestResolvedChildren.length > 0 ? guestResolvedChildren : undefined,
          notes: guestBookingNotes,
          packageDetails: partyPackage ? {
            priceUsd: partyPackage.price_usd ?? 0,
            baseChildren: partyPackage.base_children ?? 10,
            baseRoomHours: partyPackage.base_room_hours ?? 2,
            includesFood: partyPackage.includes_food ?? false,
            includesDrinks: partyPackage.includes_drinks ?? false,
            includesDecor: partyPackage.includes_decor ?? false,
            notes: partyPackage.notes ?? undefined,
            features: (partyPackage as any).features ?? [],
            additionalTerms: (partyPackage as any).additional_terms ?? [],
            extraChildPrice: (partyPackage as any).extra_child_price ?? 40,
            extraAdultPrice: (partyPackage as any).extra_adult_price ?? 10,
          } : undefined,
        });
      } catch (receiptError) {
        console.error('Failed to generate guest booking receipt:', receiptError);
      }

      // Send booking confirmation email
      const emailData: BookingEmailData = {
        reference,
        guestName,
        email: input.guestEmail,
        eventDate,
        rawEventDate: booking.event_date ?? item.eventDate,
        startTime,
        location,
        packageName,
        packageBasePrice,
        guestCount,
        depositAmount: item.unitPrice,
        subtotal,
        cleaningFee,
        taxAmount,
        taxRate: Math.round(getTaxRateSync() * 100),
        totalAmount,
        balanceRemaining,
        extraChildren,
        extraAdults,
        addOns: formattedAddOns.length > 0 ? formattedAddOns : undefined,
        receiptPdf,
        receiptNumber,
        phone: guestPhone,
        children: guestResolvedChildren.length > 0 ? guestResolvedChildren : undefined,
        notes: guestBookingNotes,
        packageDetails: partyPackage ? {
          priceUsd: partyPackage.price_usd ?? 0,
          baseChildren: partyPackage.base_children ?? 10,
          baseRoomHours: partyPackage.base_room_hours ?? 2,
          includesFood: partyPackage.includes_food ?? false,
          includesDrinks: partyPackage.includes_drinks ?? false,
          includesDecor: partyPackage.includes_decor ?? false,
          notes: partyPackage.notes ?? undefined,
          features: (partyPackage as any).features ?? [],
          additionalTerms: (partyPackage as any).additional_terms ?? [],
          extraChildPrice: (partyPackage as any).extra_child_price ?? 40,
          extraAdultPrice: (partyPackage as any).extra_adult_price ?? 10,
        } : undefined,
      };

      await sendBookingConfirmation(emailData);

      // Send admin notification for guest booking
      try {
        await sendAdminBookingNotification({
          reference,
          customerName: guestName,
          customerEmail: input.guestEmail,
          customerPhone: input.guestPhone ?? undefined,
          customerId: guestCustomer?.customer_id?.toString(),
          eventDate,
          startTime,
          location,
          packageName,
          guestCount,
          totalAmount,
          paymentId,
          paymentMethod: 'Credit Card (Square)',
          addOns: formattedAddOns.length > 0 ? formattedAddOns : undefined,
          notes: (item as { notes?: string }).notes,
          isGuestBooking: true,
        });
      } catch (adminEmailError) {
        console.error('Failed to send admin guest booking notification:', adminEmailError);
      }

      // Send SMS for booking
      if (input.guestPhone) {
        try {
          const smsData: BookingSmsData = {
            phone: input.guestPhone,
            guestName,
            reference,
            eventDate,
            startTime,
            location,
            packageName,
            guestCount,
            depositAmount: item.unitPrice,
            balanceRemaining,
          };
          await sendBookingConfirmationSms(smsData);
        } catch (smsError) {
          console.error('Failed to send guest booking SMS:', smsError);
        }
      }
    } catch (bookingEmailError) {
      console.error('Failed to send guest booking confirmation:', bookingEmailError);
    }
  }

  // Build items for email/receipt (excluding bookings - they have their own emails)
  const nonBookingLines = summary.lines.filter((_, idx) => !bookingResults.some(b => b.cartIndex === idx));
  const emailItems = nonBookingLines.map((line, _idx) => {
    const originalIdx = summary.lines.indexOf(line);
    const ticketResult = ticketResults.find(t => t.cartIndex === originalIdx);
    const ticketData = ticketResult?.ticket as { codes?: Array<{ code: string }> } | undefined;
    return {
      label: line.label,
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      total: line.total,
      codes: ticketData?.codes?.map(c => c.code),
    };
  });

  // Only send order confirmation if there are non-booking items
  if (emailItems.length > 0) {
    const nonBookingSubtotal = nonBookingLines.reduce((sum, l) => sum + l.subtotal, 0);
    const nonBookingDiscount = summary.discounts.reduce((sum, d) => sum + d.amount, 0);
    // Calculate tax only on non-booking items (bookings have their own tax in booking.total)
    const nonBookingTax = roundCurrency(nonBookingSubtotal * getTaxRateSync());
    const nonBookingTotal = roundCurrency(nonBookingSubtotal - nonBookingDiscount + nonBookingTax);

    // Create receipt record for guest ticket purchases
    let guestTicketReceiptNumber = orderNumber;
    if (ticketResults.length > 0) {
      try {
        const firstTicket = ticketResults[0]?.ticket as { orderId?: number } | undefined;
        const referenceId = firstTicket?.orderId ?? guestCustomer.customer_id ?? Date.now();
        const receiptResult = await createReceiptRecord({
          purchaseType: 'ticket',
          referenceId,
          customerId: guestCustomer.customer_id,
          subtotal: nonBookingSubtotal,
          discount: nonBookingDiscount,
          tax: nonBookingTax,
          total: nonBookingTotal,
          paymentMethod: 'Credit Card (Square)',
          paymentId,
          metadata: {
            items: emailItems,
            discounts: summary.discounts,
            guestName: `${input.guestFirstName} ${input.guestLastName}`,
            guestEmail: input.guestEmail,
          },
        });
        guestTicketReceiptNumber = receiptResult.receiptNumber;
      } catch (receiptError) {
        console.error('Failed to create guest ticket receipt record:', receiptError);
      }
    }

    try {
      // Generate PDF receipt
      const receiptPdf = await generateReceiptPDF({
        receiptNumber: guestTicketReceiptNumber,
        date: orderDate,
        customerName: `${input.guestFirstName} ${input.guestLastName}`,
        customerEmail: input.guestEmail,
        items: emailItems,
        subtotal: nonBookingSubtotal,
        taxAmount: nonBookingTax,
        discounts: summary.discounts,
        total: nonBookingTotal,
        paymentMethod: 'Credit Card (Square)',
        paymentId,
      });

      // Send confirmation email
      await sendOrderConfirmation({
        email: input.guestEmail,
        customerName: input.guestFirstName,
        orderNumber: guestTicketReceiptNumber,
        orderDate,
        items: emailItems,
        subtotal: nonBookingSubtotal,
        taxAmount: nonBookingTax,
        discounts: summary.discounts,
        total: nonBookingTotal,
        paymentMethod: 'Credit Card (Square)',
        receiptPdf,
      });

      // Send admin notification for guest ticket orders
      if (ticketResults.length > 0) {
        try {
          const adminTicketItems = ticketResults.map(t => {
            const ticket = t.ticket as { codes?: Array<{ code: string }> };
            const line = summary.lines[t.cartIndex];
            return {
              label: line?.label ?? 'Ticket',
              quantity: line?.quantity ?? 1,
              unitPrice: line?.unitPrice ?? 0,
              codes: ticket?.codes?.map(c => c.code) ?? [],
            };
          });

          await sendAdminTicketNotification({
            orderNumber: guestTicketReceiptNumber,
            customerName: `${input.guestFirstName} ${input.guestLastName}`,
            customerEmail: input.guestEmail,
            customerPhone: input.guestPhone ?? undefined,
            customerId: guestCustomer?.customer_id?.toString(),
            tickets: adminTicketItems,
            subtotal: nonBookingSubtotal,
            taxAmount: nonBookingTax,
            totalAmount: nonBookingTotal,
            discounts: summary.discounts,
            paymentId,
            paymentMethod: 'Credit Card (Square)',
            purchaseDate: orderDate,
            isGuestPurchase: true,
          });
        } catch (adminEmailError) {
          console.error('Failed to send admin guest ticket notification:', adminEmailError);
        }
      }

      // Note: Memberships require user accounts, so no membership admin notifications for guests
    } catch (emailError) {
      console.error('Failed to send guest order confirmation email:', emailError);
      // Don't fail the checkout if email fails
    }
  }

  // Send SMS notification for guest
  if (input.guestPhone) {
    try {
      const ticketItems = ticketResults.map(t => {
        const ticket = t.ticket as { codes?: Array<{ code: string }> };
        const line = summary.lines[t.cartIndex];
        return {
          label: line?.label ?? 'Ticket',
          quantity: line?.quantity ?? 1,
          codes: ticket?.codes?.map(c => c.code) ?? [],
        };
      });

      if (ticketItems.length > 0) {
        await sendTicketConfirmationSms({
          phone: input.guestPhone,
          customerName: input.guestFirstName,
          tickets: ticketItems,
          totalAmount: summary.total,
        });
      } else {
        await sendOrderConfirmationSms({
          phone: input.guestPhone,
          customerName: input.guestFirstName,
          orderNumber,
          total: summary.total,
          itemCount: summary.lines.length,
        });
      }
    } catch (smsError) {
      console.error('Failed to send guest order confirmation SMS:', smsError);
    }
  }
}
