import { randomUUID, createHash } from 'crypto';
import type { CreatePaymentRequest, Money } from 'square';

import { getSquareClient, getSquareLocationId } from '../config/square';
import { appConfig } from '../config/env';
import { supabaseAny } from '../config/supabase';
import { UserRepository, PartyBookingRepository, PaymentRepository, OrderRepository, PartyPackageRepository } from '../repositories';
import { AppError } from '../utils/app-error';
import { sendBookingConfirmation, type BookingEmailData } from './email.service';
import { sendBookingConfirmationSms, type BookingSmsData } from './sms.service';
import { createReceiptRecord, generateBookingReceiptPDF } from './receipt.service';
import { logger } from '../utils/logger';
import {
  logPaymentInitiated,
  logPaymentCompleted,
  logPaymentFailed,
  getUserFriendlyErrorMessage,
  type PaymentLogContext,
  type SquareError,
} from './payment-logger.service';
import {
  getTaxRateSync,
  getExtraChildFee,
  getExtraAdultFee,
} from './pricing-config.service';
import {
  toSquareMoney,
  PAYMENT_LIMITS,
  roundCurrency,
} from '../utils/currency';
import { withRetry } from '../utils/retry';
import { PAYMENT_STATUS } from '../utils/payment-statuses';

// Valid payment statuses (Fix #4 - accept PENDING for ACH, Afterpay, etc.)
const VALID_PAYMENT_STATUSES = ['COMPLETED', 'PENDING'];

/**
 * Generate a deterministic hash of the sourceId to use in idempotency keys.
 * SECURITY: Uses full hash instead of just last 8 chars to prevent collision attacks.
 * Returns first 16 chars of SHA-256 hash (64 bits of entropy).
 */
function hashSourceId(sourceId: string): string {
  return createHash('sha256').update(sourceId).digest('hex').slice(0, 16);
}

/**
 * Generate a deterministic idempotency key for booking deposits.
 * This prevents double-charging if the same request is retried.
 * Format: booking_deposit_{bookingId}_{sourceIdHash}
 */
function generateDepositIdempotencyKey(bookingId: number, sourceId: string): string {
  // SECURITY: Use hash of full sourceId to prevent collision attacks
  const sourceIdHash = hashSourceId(sourceId);
  return `booking_deposit_${bookingId}_${sourceIdHash}`;
}

/**
 * Generate a deterministic idempotency key for checkout payments.
 * CRITICAL (Fix #3): Never use Date.now() - it causes different keys on retry = double charges!
 * The key must be deterministic based on the payment source to ensure idempotency.
 */
function generateCheckoutIdempotencyKey(customerId: number, sourceId: string, orderId?: string): string {
  // SECURITY: Use hash of full sourceId to prevent collision attacks
  const sourceIdHash = hashSourceId(sourceId);
  if (orderId) {
    return `checkout_${orderId}_${sourceIdHash}`;
  }
  // Fix #3: Use sourceId hash alone (no timestamp) to ensure same token = same key
  // This prevents double-charging when the same payment is retried
  return `checkout_${customerId}_${sourceIdHash}`;
}

/**
 * Atomically verify booking can accept deposit (prevents double-charging).
 * Uses database-level locking via stored procedure.
 *
 * SECURITY: This function MUST use database-level locking to prevent race conditions.
 * Without atomic verification, two simultaneous deposit payments could both succeed,
 * causing double-charging of the customer.
 */
async function verifyBookingForDeposit(bookingId: number): Promise<void> {
  const { data, error } = await supabaseAny.rpc('process_booking_deposit', {
    p_booking_id: bookingId,
    p_expected_status: 'pending',
  });

  if (error) {
    // SECURITY: RPC is required for race condition protection - do not allow fallback
    if (error.code === '42883') {
      logger.error({ bookingId }, 'CRITICAL: process_booking_deposit RPC not found - migration required');
      throw new AppError(
        'Payment system is temporarily unavailable. Please try again in a few minutes.',
        503
      );
    }
    logger.error({ error, bookingId }, 'Failed to verify booking for deposit');
    throw new AppError('Failed to verify booking status', 500);
  }

  const result = Array.isArray(data) ? data[0] : data;

  if (!result?.success) {
    throw new AppError(result?.error_message || 'Booking cannot accept deposit', 400);
  }
}

/**
 * Atomically complete booking deposit update (prevents race conditions).
 *
 * SECURITY: This function MUST use database-level locking to prevent race conditions.
 * Returns true only if the deposit was successfully marked as paid atomically.
 */
async function completeBookingDeposit(
  bookingId: number,
  paymentIntentId: string,
  balanceRemaining: number
): Promise<boolean> {
  const { data, error } = await supabaseAny.rpc('complete_booking_deposit', {
    p_booking_id: bookingId,
    p_payment_intent_id: paymentIntentId,
    p_balance_remaining: balanceRemaining,
  });

  if (error) {
    // SECURITY: RPC is required for race condition protection
    if (error.code === '42883') {
      logger.error({ bookingId }, 'CRITICAL: complete_booking_deposit RPC not found - migration required');
      // Return false to trigger fallback which will still update booking status
      // This is safer than failing the whole payment after money is already taken
      return false;
    }
    logger.error({ error, bookingId, paymentIntentId }, 'Error completing booking deposit atomically');
    return false; // Allow fallback to continue so booking gets updated
  }

  const result = Array.isArray(data) ? data[0] : data;
  return result?.success ?? false;
}

// Payment method types
export type PaymentMethod = 'card' | 'cash' | 'partial';

export interface PartialPaymentDetails {
  cashAmount: number;
  cardAmount: number;
}

function assertSquareConfigured() {
  if (!appConfig.squareAccessToken) {
    throw new AppError('Payments are temporarily unavailable. Please try again later.', 503);
  }
}

/**
 * Check if an error is a Square API error and extract user-friendly message.
 * Square SDK v43+ throws objects with { statusCode, errors, body } on API failures.
 */
function handleSquareApiError(error: unknown): AppError | null {
  if (!error || typeof error !== 'object') return null;

  const obj = error as Record<string, unknown>;

  // Square SDK errors have statusCode and errors array
  if ('statusCode' in obj && 'errors' in obj && Array.isArray(obj.errors)) {
    const errors = obj.errors as SquareError[];
    const statusCode = obj.statusCode as number;
    const primaryError = errors[0];

    // For 4xx client errors, return user-friendly message
    if (statusCode >= 400 && statusCode < 500 && primaryError?.code) {
      const message = getUserFriendlyErrorMessage(primaryError.code);
      return new AppError(message, 400);
    }
  }

  return null;
}

/**
 * Validate payment amount is within Square's limits (Fix #7 & #19)
 */
function validatePaymentAmount(amount: number): void {
  if (amount < PAYMENT_LIMITS.MIN_USD) {
    throw new AppError(`Minimum payment amount is $${PAYMENT_LIMITS.MIN_USD.toFixed(2)}`, 400);
  }
  if (amount > PAYMENT_LIMITS.MAX_USD) {
    throw new AppError(`Payment amount exceeds the maximum of $${PAYMENT_LIMITS.MAX_USD.toFixed(2)}`, 400);
  }
}

// Note: toSquareMoney is now imported from utils/currency.ts (Fix #11)

// Helper to send booking confirmation email and SMS
async function sendBookingConfirmationEmail(
  booking: any,
  guardian: any,
  depositAmount: number,
  paymentId?: string
): Promise<void> {
  // Get package details
  const partyPackage = booking.package_id
    ? await PartyPackageRepository.findById(booking.package_id)
    : null;

  const reference = booking.reference ?? `PF-${booking.booking_id}`;
  const guestName = `${guardian.first_name} ${guardian.last_name}`.trim();
  const eventDate = booking.event_date
    ? new Date(booking.event_date).toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    : 'TBD';
  const startTime = booking.start_time ?? 'TBD';
  const location = booking.location_name ?? 'Albany';
  const packageName = partyPackage?.name ?? 'Party Package';
  const packageBasePrice = partyPackage?.price_usd ?? 0;
  const guestCount = booking.guests ?? 10;
  const totalAmount = booking.total ?? 0;
  const balanceRemaining = booking.balance_remaining ?? 0;
  const subtotal = booking.subtotal ?? 0;
  const cleaningFee = booking.cleaning_fee ?? 0;
  // Calculate tax from stored subtotal and cleaning fee using centralized tax rate
  // Use roundCurrency() for consistency with booking.service.ts (Bug fix #2)
  const taxableAmount = subtotal + cleaningFee;
  const taxAmount = roundCurrency(taxableAmount * getTaxRateSync());

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

  // Parse add-ons (exclude extra_child and extra_adult as they're shown separately)
  const filteredAddOns = addOnsArray.filter(a =>
    a.id !== 'extra_child' && a.id !== 'extra_adult' &&
    a.name !== 'Extra Child' && a.name !== 'Extra Adult'
  );
  const formattedAddOns = filteredAddOns.map(a => ({
    name: a.label ?? a.name ?? 'Add-on',
    price: a.price,
    quantity: a.quantity ?? 1,
  }));

  // Generate receipt record and PDF
  let receiptNumber: string | undefined;
  let receiptPdf: Buffer | undefined;

  try {
    const receiptResult = await createReceiptRecord({
      purchaseType: 'booking',
      referenceId: booking.booking_id,
      customerId: booking.customer_id ?? guardian.customer_id ?? null,
      subtotal,
      discount: 0,
      tax: taxAmount,
      total: totalAmount,
      paymentMethod: 'Credit Card (Square)',
      paymentId: paymentId ?? `booking_${booking.booking_id}`,
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
        taxRate: Math.round(getTaxRateSync() * 100), // Tax rate as percentage from config
        cleaningFee,
        extraChildren,
        extraAdults,
        addOns: formattedAddOns.length > 0 ? formattedAddOns : undefined,
        totalAmount,
        balanceRemaining,
        packageDetails: partyPackage ? {
          priceUsd: partyPackage.price_usd ?? 0,
          baseChildren: partyPackage.base_children ?? 10,
          baseRoomHours: partyPackage.base_room_hours ?? 2,
          includesFood: partyPackage.includes_food ?? false,
          includesDrinks: partyPackage.includes_drinks ?? false,
          includesDecor: partyPackage.includes_decor ?? false,
          notes: partyPackage.notes ?? undefined,
        } : undefined,
      },
    });
    receiptNumber = receiptResult.receiptNumber;

    // Generate PDF with full package details
    receiptPdf = await generateBookingReceiptPDF({
      receiptNumber,
      date: new Date().toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      }),
      customerName: guestName || 'Customer',
      customerEmail: guardian.email ?? booking.guest_email ?? '',
      bookingReference: reference,
      packageName,
      packageBasePrice,
      eventDate,
      startTime,
      location,
      guestCount,
      subtotal,
      taxAmount,
      cleaningFee,
      extraChildren,
      extraAdults,
      addOns: formattedAddOns.length > 0 ? formattedAddOns : undefined,
      depositAmount,
      balanceRemaining,
      total: totalAmount,
      paymentMethod: 'Credit Card (Square)',
      paymentId: paymentId ?? `booking_${booking.booking_id}`,
      // Include full package details for page 2
      packageDetails: partyPackage ? {
        priceUsd: partyPackage.price_usd ?? 0,
        baseChildren: partyPackage.base_children ?? 10,
        baseRoomHours: partyPackage.base_room_hours ?? 2,
        includesFood: partyPackage.includes_food ?? false,
        includesDrinks: partyPackage.includes_drinks ?? false,
        includesDecor: partyPackage.includes_decor ?? false,
        notes: partyPackage.notes ?? undefined,
      } : undefined,
    });
  } catch (receiptError) {
    logger.error({ err: receiptError, bookingId: booking.booking_id }, 'Failed to generate booking receipt');
    // Don't fail the payment if receipt generation fails
  }

  // Send email
  if (guardian.email) {
    try {
      const emailData: BookingEmailData = {
        reference,
        guestName,
        email: guardian.email,
        eventDate,
        rawEventDate: booking.event_date ?? undefined,
        startTime,
        location,
        packageName,
        packageBasePrice,
        guestCount,
        depositAmount,
        subtotal,
        cleaningFee,
        taxAmount,
        totalAmount,
        balanceRemaining,
        extraChildren,
        extraAdults,
        addOns: formattedAddOns.length > 0 ? formattedAddOns : undefined,
        receiptPdf,
        receiptNumber,
      };

      await sendBookingConfirmation(emailData);
    } catch (error) {
      logger.error({ err: error, bookingId: booking.booking_id, email: guardian.email }, 'Failed to send booking confirmation email');
      // Don't throw - email failure shouldn't fail the payment
    }
  }

  // Send SMS
  const phone = guardian.phone || booking.guest_phone;
  if (phone) {
    try {
      const smsData: BookingSmsData = {
        phone,
        guestName,
        reference,
        eventDate,
        startTime,
        location,
        packageName,
        guestCount,
        depositAmount,
        balanceRemaining,
      };

      await sendBookingConfirmationSms(smsData);
    } catch (error) {
      logger.error({ err: error, bookingId: booking.booking_id, phone }, 'Failed to send booking confirmation SMS');
      // Don't throw - SMS failure shouldn't fail the payment
    }
  }
}

/**
 * Create a Square payment for booking deposit
 */
export async function createSquarePayment(
  guardianId: string,
  bookingId: string,
  sourceId: string, // nonce from Square Web Payments SDK
  paymentMethod: PaymentMethod = 'card',
  partialDetails?: PartialPaymentDetails
) {
  assertSquareConfigured();

  const guardianIdNum = parseInt(guardianId, 10);
  const bookingIdNum = parseInt(bookingId, 10);

  if (isNaN(guardianIdNum) || isNaN(bookingIdNum)) {
    throw new AppError('Invalid IDs', 400);
  }

  const guardian = await UserRepository.findById(guardianIdNum);
  if (!guardian?.customer_id) {
    throw new AppError('Guardian not found', 404);
  }

  const booking = await PartyBookingRepository.findById(bookingIdNum);
  if (!booking) {
    throw new AppError('Booking not found', 404);
  }

  // For authenticated bookings, verify customer ownership
  // Guest bookings (customer_id is null) are handled separately via guest checkout flow
  if (booking.customer_id !== null && booking.customer_id !== guardian.customer_id) {
    throw new AppError('Booking not found', 404);
  }

  // Quick check for already-paid status (fast path - saves unnecessary RPC call)
  // NOTE: This is an optimization only. The atomic verification below is the authoritative check.
  if (booking.payment_status === PAYMENT_STATUS.DEPOSIT_PAID) {
    throw new AppError('Deposit already paid for this booking', 400);
  }

  // Bug fix #5: Reject deposits on cancelled/rejected bookings
  if (booking.status === 'Cancelled' || booking.status === 'Rejected') {
    throw new AppError('Cannot process payment for a cancelled booking', 400);
  }

  // SECURITY: Atomic verification with database-level locking (prevents race conditions)
  // This MUST succeed before proceeding - prevents double-charging from concurrent requests
  await verifyBookingForDeposit(bookingIdNum);

  const depositAmount = booking.deposit_amount ?? 0;
  if (depositAmount <= 0) {
    throw new AppError('Deposit amount is invalid', 400);
  }

  // Handle partial payments
  let cardPaymentAmount = depositAmount;
  let cashPaymentAmount = 0;

  if (paymentMethod === 'partial' && partialDetails) {
    cashPaymentAmount = partialDetails.cashAmount;
    cardPaymentAmount = partialDetails.cardAmount;

    // Validate partial payment amounts
    const totalPartial = cashPaymentAmount + cardPaymentAmount;
    if (Math.abs(totalPartial - depositAmount) > 0.01) {
      throw new AppError('Partial payment amounts must equal total deposit', 400);
    }

    // Bug fix #6: Validate card portion meets Square's minimum
    if (cardPaymentAmount > 0) {
      validatePaymentAmount(cardPaymentAmount);
    }
  } else if (paymentMethod === 'cash') {
    // Cash-only payments are not allowed - must use Square
    throw new AppError('Cash-only payments must be processed in person. Use partial payment or card.', 400);
  }

  // Generate deterministic idempotency key tied to booking + payment source
  // This prevents double-charging if the same request is retried
  const idempotencyKey = generateDepositIdempotencyKey(bookingIdNum, sourceId);
  const logContext: PaymentLogContext = {
    idempotencyKey,
    customerId: guardian.customer_id,
    userId: guardianIdNum,
    bookingId: bookingIdNum,
    paymentType: 'booking_deposit',
    amount: cardPaymentAmount,
    referenceId: `booking_${booking.booking_id}`,
    metadata: {
      bookingReference: booking.reference,
      depositAmount,
      cardPaymentAmount,
      cashPaymentAmount,
      paymentMethod,
    },
  };

  // Process Square payment
  const square = getSquareClient();
  const locationId = getSquareLocationId();

  // Process card payment via Square
  if (cardPaymentAmount > 0) {
    const paymentRequest: CreatePaymentRequest = {
      sourceId,
      idempotencyKey,
      amountMoney: toSquareMoney(cardPaymentAmount),
      locationId,
      referenceId: `booking_${booking.booking_id}`,
      note: `Deposit for party booking ${booking.reference ?? booking.booking_id}`,
    };

    // Log payment initiation
    const logResult = await logPaymentInitiated(logContext, paymentRequest);
    const startTime = Date.now();

    try {
      // Fix #15: Add retry logic for transient errors
      const response = await withRetry(
        () => square.payments.create(paymentRequest),
        { maxRetries: 3, operationName: 'squareDepositPaymentCreate' }
      );
      const processingTime = Date.now() - startTime;

      // Fix #4: Accept both COMPLETED and PENDING statuses
      // PENDING is valid for ACH transfers, Afterpay/Clearpay, gift cards, etc.
      if (!response.payment || !VALID_PAYMENT_STATUSES.includes(response.payment.status ?? '')) {
        // Log failure
        const errors: SquareError[] = response.errors ?? [{
          category: 'PAYMENT_METHOD_ERROR',
          code: 'PAYMENT_NOT_COMPLETED',
          detail: `Payment status: ${response.payment?.status ?? 'unknown'}`,
        }];
        await logPaymentFailed(logResult, errors, processingTime, response);

        const errorMessage = errors[0]?.code
          ? getUserFriendlyErrorMessage(errors[0].code)
          : 'Payment failed. Please try again.';
        throw new AppError(errorMessage, 400);
      }

      const payment = response.payment;
      const isPending = payment.status === 'PENDING';

      // Log successful payment
      await logPaymentCompleted(logResult, payment, processingTime);

      // Create order record (status depends on payment status)
      const order = await OrderRepository.create({
        customer_id: guardian.customer_id,
        location_id: booking.resource_id,
        order_type: 'Party',
        status: isPending ? 'Payment Pending' : 'Completed',
        subtotal_usd: depositAmount,
        discount_usd: 0,
        tax_usd: 0,
        total_usd: depositAmount,
        notes: `Deposit for booking ${booking.reference ?? booking.booking_id}${isPending ? ' (payment pending)' : ''}`,
      });

      if (!order?.order_id) {
        logger.error({ bookingId: bookingIdNum, paymentId: payment.id }, 'Order creation failed after successful payment');
        throw new AppError('Failed to create order record. Please contact support with your payment ID.', 500);
      }

      // Record card payment with receipt URL (Fix #16)
      await PaymentRepository.create({
        order_id: order.order_id,
        provider: 'square',
        provider_payment_id: payment.id!,
        amount_usd: cardPaymentAmount,
        status: isPending ? 'Pending' : 'Captured',
        receipt_url: payment.receiptUrl ?? null,
      });

      // Record cash payment if partial
      if (cashPaymentAmount > 0) {
        await PaymentRepository.create({
          order_id: order.order_id,
          provider: 'cash',
          provider_payment_id: `cash_${randomUUID()}`,
          amount_usd: cashPaymentAmount,
          status: 'Captured',
        });
      }

      // Update booking atomically
      const totalAmount = booking.total ?? 0;
      const newBalance = Math.max(totalAmount - depositAmount, 0);

      // Try atomic update first (prevents race conditions)
      const atomicSuccess = await completeBookingDeposit(bookingIdNum, payment.id!, newBalance);

      if (!atomicSuccess) {
        // Fallback to regular update (RPC may not exist)
        await PartyBookingRepository.update(bookingIdNum, {
          payment_status: PAYMENT_STATUS.DEPOSIT_PAID,
          status: 'Confirmed',
          balance_remaining: newBalance,
          deposit_paid_at: new Date().toISOString(),
          latest_payment_id: payment.id,
        });
      }

      // Send booking confirmation email with receipt
      const updatedBooking = await PartyBookingRepository.findById(bookingIdNum);
      if (updatedBooking) {
        await sendBookingConfirmationEmail(updatedBooking, guardian, depositAmount, payment.id);
      }

      return {
        paymentId: payment.id,
        amount: depositAmount,
        cardAmount: cardPaymentAmount,
        cashAmount: cashPaymentAmount,
        currency: 'USD',
        status: payment.status,
        receiptUrl: payment.receiptUrl,
      };
    } catch (error) {
      const processingTime = Date.now() - startTime;

      // If it's already an AppError, it was logged above
      if (error instanceof AppError) {
        throw error;
      }

      // Check if this is a Square API error (e.g., invalid card, declined)
      const squareAppError = handleSquareApiError(error);
      if (squareAppError) {
        // Log the Square API error with proper details
        const squareErrors = (error as { errors?: SquareError[] }).errors ?? [];
        await logPaymentFailed(logResult, squareErrors, processingTime, error);
        throw squareAppError;
      }

      // Log unexpected error
      const squareError: SquareError = {
        category: 'API_ERROR',
        code: 'UNEXPECTED_ERROR',
        detail: error instanceof Error ? error.message : 'Unknown error occurred',
      };
      await logPaymentFailed(logResult, [squareError], processingTime, { error: String(error) });

      throw new AppError('An unexpected error occurred during payment. Please try again.', 500);
    }
  }

  throw new AppError('Card payment amount is required', 400);
}

/**
 * Process checkout payment via Square
 */
export async function processSquareCheckout(
  customerId: number,
  sourceId: string,
  totalAmount: number,
  paymentMethod: PaymentMethod = 'card',
  partialDetails?: PartialPaymentDetails,
  metadata?: Record<string, string>
) {
  assertSquareConfigured();

  if (totalAmount <= 0) {
    throw new AppError('Payment amount must be positive', 400);
  }

  // Fix #7 & #19: Validate payment amount is within Square's limits
  validatePaymentAmount(totalAmount);

  let cardPaymentAmount = totalAmount;
  let cashPaymentAmount = 0;

  if (paymentMethod === 'partial' && partialDetails) {
    cashPaymentAmount = partialDetails.cashAmount;
    cardPaymentAmount = partialDetails.cardAmount;

    const totalPartial = cashPaymentAmount + cardPaymentAmount;
    if (Math.abs(totalPartial - totalAmount) > 0.01) {
      throw new AppError('Partial payment amounts must equal total', 400);
    }
  } else if (paymentMethod === 'cash') {
    throw new AppError('Cash-only payments must be processed in person. Use partial payment or card.', 400);
  }

  // Generate deterministic idempotency key tied to customer + payment source
  const idempotencyKey = generateCheckoutIdempotencyKey(customerId, sourceId, metadata?.orderId);

  // Prepare logging context
  const logContext: PaymentLogContext = {
    idempotencyKey,
    customerId,
    paymentType: 'checkout',
    amount: cardPaymentAmount,
    referenceId: metadata?.orderId,
    metadata: {
      totalAmount,
      cardPaymentAmount,
      cashPaymentAmount,
      paymentMethod,
      description: metadata?.description,
    },
  };

  // Process Square payment
  const square = getSquareClient();
  const locationId = getSquareLocationId();

  if (cardPaymentAmount > 0) {
    const paymentRequest: CreatePaymentRequest = {
      sourceId,
      idempotencyKey,
      amountMoney: toSquareMoney(cardPaymentAmount),
      locationId,
      referenceId: metadata?.orderId ?? `checkout_${randomUUID()}`,
      note: metadata?.description ?? 'Playfunia checkout',
    };

    // Log payment initiation
    const logResult = await logPaymentInitiated(logContext, paymentRequest);
    const startTime = Date.now();

    try {
      // Fix #15: Add retry logic for transient errors
      const response = await withRetry(
        () => square.payments.create(paymentRequest),
        { maxRetries: 3, operationName: 'squareCheckoutPaymentCreate' }
      );
      const processingTime = Date.now() - startTime;

      // Fix #4: Accept both COMPLETED and PENDING statuses
      if (!response.payment || !VALID_PAYMENT_STATUSES.includes(response.payment.status ?? '')) {
        // Log failure
        const errors: SquareError[] = response.errors ?? [{
          category: 'PAYMENT_METHOD_ERROR',
          code: 'PAYMENT_NOT_COMPLETED',
          detail: `Payment status: ${response.payment?.status ?? 'unknown'}`,
        }];
        await logPaymentFailed(logResult, errors, processingTime, response);

        const errorMessage = errors[0]?.code
          ? getUserFriendlyErrorMessage(errors[0].code)
          : 'Payment failed. Please try again.';
        throw new AppError(errorMessage, 400);
      }

      const payment = response.payment;

      // Log successful payment
      await logPaymentCompleted(logResult, payment, processingTime);

      return {
        paymentId: payment.id,
        amount: totalAmount,
        cardAmount: cardPaymentAmount,
        cashAmount: cashPaymentAmount,
        currency: 'USD',
        status: payment.status,
        receiptUrl: payment.receiptUrl,
      };
    } catch (error) {
      const processingTime = Date.now() - startTime;

      // If it's already an AppError, it was logged above
      if (error instanceof AppError) {
        throw error;
      }

      // Check if this is a Square API error (e.g., invalid card, declined)
      const squareAppError = handleSquareApiError(error);
      if (squareAppError) {
        const squareErrors = (error as { errors?: SquareError[] }).errors ?? [];
        await logPaymentFailed(logResult, squareErrors, processingTime, error);
        throw squareAppError;
      }

      // Log unexpected error
      const squareError: SquareError = {
        category: 'API_ERROR',
        code: 'UNEXPECTED_ERROR',
        detail: error instanceof Error ? error.message : 'Unknown error occurred',
      };
      await logPaymentFailed(logResult, [squareError], processingTime, { error: String(error) });

      throw new AppError('An unexpected error occurred during payment. Please try again.', 500);
    }
  }

  throw new AppError('Card payment amount is required', 400);
}

/**
 * Get Square application ID for frontend
 */
export function getSquareAppId(): string {
  if (!appConfig.squareApplicationId) {
    throw new AppError('Square application ID is not configured', 503);
  }
  return appConfig.squareApplicationId;
}

/**
 * Get Square location ID for frontend
 */
export function getSquareLocation(): string {
  return getSquareLocationId();
}
