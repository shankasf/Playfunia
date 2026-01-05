import { randomUUID } from 'crypto';
import type { CreatePaymentRequest, Money, CreatePaymentResponse } from 'square';

import { getSquareClient, getSquareLocationId } from '../config/square';
import { appConfig } from '../config/env';
import { UserRepository, PartyBookingRepository, PaymentRepository, OrderRepository } from '../repositories';
import { AppError } from '../utils/app-error';

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

  // Mock payment mode
  if (appConfig.mockPayments) {
    const mockPaymentId = `mock_sq_${randomUUID()}`;

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
      idempotencyKey: randomUUID(),
      amountMoney: toSquareMoney(cardPaymentAmount),
      locationId,
      referenceId: `booking_${booking.booking_id}`,
      note: `Deposit for party booking ${booking.reference ?? booking.booking_id}`,
    };

    const response = await square.payments.create(paymentRequest);

    if (!response.payment || response.payment.status !== 'COMPLETED') {
      throw new AppError('Payment failed. Please try again.', 400);
    }

    const payment = response.payment;

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

    return {
      paymentId: payment.id,
      amount: depositAmount,
      cardAmount: cardPaymentAmount,
      cashAmount: cashPaymentAmount,
      currency: 'USD',
      status: payment.status,
      receiptUrl: payment.receiptUrl,
    };
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

  // Mock payment mode
  if (appConfig.mockPayments) {
    const mockPaymentId = `mock_sq_checkout_${randomUUID()}`;

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
      idempotencyKey: randomUUID(),
      amountMoney: toSquareMoney(cardPaymentAmount),
      locationId,
      referenceId: metadata?.orderId ?? `checkout_${randomUUID()}`,
      note: metadata?.description ?? 'Playfunia checkout',
    };

    const response = await square.payments.create(paymentRequest);

    if (!response.payment || response.payment.status !== 'COMPLETED') {
      throw new AppError('Payment failed. Please try again.', 400);
    }

    const payment = response.payment;

    return {
      paymentId: payment.id,
      amount: totalAmount,
      cardAmount: cardPaymentAmount,
      cashAmount: cashPaymentAmount,
      currency: 'USD',
      status: payment.status,
      receiptUrl: payment.receiptUrl,
    };
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
