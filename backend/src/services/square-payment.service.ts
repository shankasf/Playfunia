import { randomUUID } from 'crypto';
import type { CreatePaymentRequest, Money } from 'square';

import { getSquareClient, getSquareLocationId } from '../config/square';
import { appConfig } from '../config/env';
import { UserRepository, PartyBookingRepository, PaymentRepository, OrderRepository, PartyPackageRepository } from '../repositories';
import { AppError } from '../utils/app-error';
import { sendBookingConfirmation, type BookingEmailData } from './email.service';
import { sendBookingConfirmationSms, type BookingSmsData } from './sms.service';
import { createReceiptRecord, generateBookingReceiptPDF } from './receipt.service';
import {
  logPaymentInitiated,
  logPaymentCompleted,
  logPaymentFailed,
  logMockPayment,
  getUserFriendlyErrorMessage,
  type PaymentLogContext,
  type SquareError,
} from './payment-logger.service';

// Payment method types
export type PaymentMethod = 'card' | 'cash' | 'partial';

export interface PartialPaymentDetails {
  cashAmount: number;
  cardAmount: number;
}

function assertSquareConfigured() {
  if (!appConfig.mockPayments && !appConfig.squareAccessToken) {
    throw new AppError('Payments are temporarily unavailable. Please try again later.', 503);
  }
}

function toSquareMoney(amount: number): Money {
  return {
    amount: BigInt(Math.round(amount * 100)),
    currency: 'USD',
  };
}

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
  const guestCount = booking.guests ?? 10;
  const totalAmount = booking.total ?? 0;
  const balanceRemaining = booking.balance_remaining ?? 0;
  const subtotal = booking.subtotal ?? totalAmount;
  const cleaningFee = booking.cleaning_fee ?? 0;

  // Generate receipt record and PDF
  let receiptNumber: string | undefined;
  let receiptPdf: Buffer | undefined;

  try {
    const receiptResult = await createReceiptRecord({
      purchaseType: 'booking',
      referenceId: booking.booking_id,
      customerId: booking.customer_id ?? guardian.customer_id ?? null,
      subtotal: depositAmount,
      discount: 0,
      tax: 0,
      total: depositAmount,
      paymentMethod: 'Credit Card (Square)',
      paymentId: paymentId ?? `booking_${booking.booking_id}`,
      metadata: {
        bookingReference: reference,
        packageName,
        eventDate: booking.event_date,
        startTime,
        location,
        guestCount,
        totalAmount,
        balanceRemaining,
        addOns: booking.add_ons,
      },
    });
    receiptNumber = receiptResult.receiptNumber;

    // Parse add-ons for PDF
    const addOns = (booking.add_ons ?? []) as Array<{ label?: string; name?: string; price: number; quantity: number }>;
    const formattedAddOns = addOns.map(a => ({
      name: a.label ?? a.name ?? 'Add-on',
      price: a.price,
      quantity: a.quantity ?? 1,
    }));

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
      eventDate,
      startTime,
      location,
      guestCount,
      subtotal,
      cleaningFee,
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
    console.error('Failed to generate booking receipt:', receiptError);
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
        startTime,
        location,
        packageName,
        guestCount,
        depositAmount,
        totalAmount,
        balanceRemaining,
        receiptPdf,
        receiptNumber,
      };

      await sendBookingConfirmation(emailData);
    } catch (error) {
      console.error('Failed to send booking confirmation email:', error);
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
      console.error('Failed to send booking confirmation SMS:', error);
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

  if (booking.payment_status === 'deposit_paid') {
    throw new AppError('Deposit already paid for this booking', 400);
  }

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
  } else if (paymentMethod === 'cash') {
    // Cash-only payments are not allowed - must use Square
    throw new AppError('Cash-only payments must be processed in person. Use partial payment or card.', 400);
  }

  // Prepare logging context
  const idempotencyKey = randomUUID();
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

  // Mock payment mode
  if (appConfig.mockPayments) {
    const mockPaymentId = `mock_sq_${randomUUID()}`;

    // Log mock payment
    await logMockPayment(logContext, mockPaymentId);

    // Create order record
    const order = await OrderRepository.create({
      customer_id: guardian.customer_id,
      location_id: booking.resource_id,
      order_type: 'Party',
      status: 'Pending',
      subtotal_usd: depositAmount,
      discount_usd: 0,
      tax_usd: 0,
      total_usd: depositAmount,
      notes: `Deposit for booking ${booking.reference ?? booking.booking_id}`,
    });

    // Create payment record for card portion
    if (cardPaymentAmount > 0) {
      await PaymentRepository.create({
        order_id: order.order_id,
        provider: 'square',
        provider_payment_id: mockPaymentId,
        amount_usd: cardPaymentAmount,
        status: 'Captured',
      });
    }

    // Record cash portion if applicable
    if (cashPaymentAmount > 0) {
      await PaymentRepository.create({
        order_id: order.order_id,
        provider: 'cash',
        provider_payment_id: `cash_${randomUUID()}`,
        amount_usd: cashPaymentAmount,
        status: 'Captured',
      });
    }

    // Update booking status
    const totalAmount = booking.total ?? 0;
    const newBalance = Math.max(totalAmount - depositAmount, 0);

    await PartyBookingRepository.update(bookingIdNum, {
      payment_status: 'deposit_paid',
      status: 'Confirmed',
      balance_remaining: newBalance,
      deposit_paid_at: new Date().toISOString(),
    });

    // Send booking confirmation email with receipt
    const updatedBooking = await PartyBookingRepository.findById(bookingIdNum);
    if (updatedBooking) {
      await sendBookingConfirmationEmail(updatedBooking, guardian, depositAmount, mockPaymentId);
    }

    return {
      paymentId: mockPaymentId,
      amount: depositAmount,
      cardAmount: cardPaymentAmount,
      cashAmount: cashPaymentAmount,
      currency: 'USD',
      status: 'COMPLETED',
      mock: true,
    };
  }

  // Real Square payment
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
      const response = await square.payments.create(paymentRequest);
      const processingTime = Date.now() - startTime;

      if (!response.payment || response.payment.status !== 'COMPLETED') {
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

      // Create order record
      const order = await OrderRepository.create({
        customer_id: guardian.customer_id,
        location_id: booking.resource_id,
        order_type: 'Party',
        status: 'Completed',
        subtotal_usd: depositAmount,
        discount_usd: 0,
        tax_usd: 0,
        total_usd: depositAmount,
        notes: `Deposit for booking ${booking.reference ?? booking.booking_id}`,
      });

      // Record card payment
      await PaymentRepository.create({
        order_id: order.order_id,
        provider: 'square',
        provider_payment_id: payment.id!,
        amount_usd: cardPaymentAmount,
        status: 'Captured',
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

      // Update booking
      const totalAmount = booking.total ?? 0;
      const newBalance = Math.max(totalAmount - depositAmount, 0);

      await PartyBookingRepository.update(bookingIdNum, {
        payment_status: 'deposit_paid',
        status: 'Confirmed',
        balance_remaining: newBalance,
        deposit_paid_at: new Date().toISOString(),
        latest_payment_intent_id: payment.id,
      });

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

  // Prepare logging context
  const idempotencyKey = randomUUID();
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

  // Mock payment mode
  if (appConfig.mockPayments) {
    const mockPaymentId = `mock_sq_checkout_${randomUUID()}`;

    // Log mock payment
    await logMockPayment(logContext, mockPaymentId);

    return {
      paymentId: mockPaymentId,
      amount: totalAmount,
      cardAmount: cardPaymentAmount,
      cashAmount: cashPaymentAmount,
      currency: 'USD',
      status: 'COMPLETED',
      mock: true,
    };
  }

  // Real Square payment
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
      const response = await square.payments.create(paymentRequest);
      const processingTime = Date.now() - startTime;

      if (!response.payment || response.payment.status !== 'COMPLETED') {
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
