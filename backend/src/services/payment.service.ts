import type Stripe from 'stripe';
import { randomUUID } from 'crypto';

import { getStripeClient } from '../config/stripe';
import { appConfig } from '../config/env';
import { UserRepository, PartyBookingRepository, PaymentRepository, OrderRepository } from '../repositories';
import { AppError } from '../utils/app-error';

function assertStripeConfigured() {
  if (!appConfig.mockPayments && !appConfig.stripeSecretKey) {
    throw new AppError('Payments are temporarily unavailable. Please try again later.', 503);
  }
}

export async function createBookingDepositPaymentIntent(guardianId: string, bookingId: string) {
  assertStripeConfigured();

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

  const amountInCents = Math.round(depositAmount * 100);

  // Mock payment mode - create order and payment records without Stripe
  if (appConfig.mockPayments) {
    const mockIntentId = `mock_pi_${randomUUID()}`;
    const mockClientSecret = `mock_secret_${randomUUID()}`;

    // Create an order record for the party booking deposit
    const order = await OrderRepository.create({
      customer_id: guardian.customer_id,
      location_id: booking.resource_id, // Use resource's location
      order_type: 'Party',
      status: 'Pending',
      subtotal_usd: depositAmount,
      discount_usd: 0,
      tax_usd: 0,
      total_usd: depositAmount,
      notes: `Deposit for booking ${booking.reference ?? booking.booking_id}`,
    });

    // Create payment record linked to the order
    await PaymentRepository.create({
      order_id: order.order_id,
      stripe_payment_intent_id: mockIntentId,
      amount_usd: depositAmount,
      status: 'Pending',
    });

    return {
      clientSecret: mockClientSecret,
      paymentIntentId: mockIntentId,
      amount: depositAmount,
      currency: 'usd',
      mock: true,
    };
  }

  const stripe = getStripeClient();
  const receiptEmail = guardian.email;

  const intentParams: Stripe.PaymentIntentCreateParams = {
    amount: amountInCents,
    currency: 'usd',
    metadata: {
      bookingId: String(booking.booking_id),
      reference: booking.reference ?? '',
      guardianId,
      purpose: 'booking_deposit',
    },
    automatic_payment_methods: { enabled: true },
  };

  if (receiptEmail) {
    intentParams.receipt_email = receiptEmail;
  }

  const intent = await stripe.paymentIntents.create(intentParams);

  // Create payment record
  await PaymentRepository.create({
    order_id: booking.booking_id, // Reusing order_id field to link to booking
    stripe_payment_intent_id: intent.id,
    amount_usd: depositAmount,
    status: 'Pending',
  });

  return {
    clientSecret: intent.client_secret,
    paymentIntentId: intent.id,
    amount: depositAmount,
    currency: intent.currency ?? 'usd',
  };
}

export async function confirmBookingDepositPayment(
  guardianId: string,
  bookingId: string,
  paymentIntentId: string,
) {
  assertStripeConfigured();

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
    return {
      bookingId: String(booking.booking_id),
      balanceRemaining: booking.balance_remaining,
      status: booking.status,
    };
  }

  const depositAmount = booking.deposit_amount ?? 0;
  const totalAmount = booking.total ?? 0;
  const newBalance = Math.max(totalAmount - depositAmount, 0);

  // Mock payment mode - update records without Stripe verification
  if (appConfig.mockPayments) {
    await PartyBookingRepository.update(bookingIdNum, {
      payment_status: 'deposit_paid',
      status: 'Confirmed',
      balance_remaining: newBalance,
    });

    // Update payment record to Captured status
    const payment = await PaymentRepository.findByStripePaymentIntentId(paymentIntentId);
    if (payment) {
      await PaymentRepository.update(payment.payment_id, { status: 'Captured' });
    }

    return {
      bookingId: String(booking.booking_id),
      balanceRemaining: newBalance,
      status: 'Confirmed',
    };
  }

  const stripe = getStripeClient();
  const intent = await stripe.paymentIntents.retrieve(paymentIntentId);

  if (intent.status !== 'succeeded') {
    throw new AppError('Payment is not complete yet. Please try again.', 400);
  }

  if (intent.metadata?.bookingId && intent.metadata.bookingId !== String(booking.booking_id)) {
    throw new AppError('Payment does not belong to this booking', 400);
  }

  const amountReceived = (intent.amount_received ?? intent.amount ?? 0) / 100;
  const expectedAmount = Number(depositAmount.toFixed(2));
  if (Number(amountReceived.toFixed(2)) !== expectedAmount) {
    throw new AppError('Payment amount does not match the required deposit', 400);
  }

  await PartyBookingRepository.update(bookingIdNum, {
    payment_status: 'deposit_paid',
    status: 'Confirmed',
    balance_remaining: newBalance,
  });

  // Update payment record
  const payment = await PaymentRepository.findByStripePaymentIntentId(paymentIntentId);
  if (payment) {
    await PaymentRepository.update(payment.payment_id, { status: 'Captured' });
  }

  return {
    bookingId: String(booking.booking_id),
    balanceRemaining: newBalance,
    status: 'Confirmed',
  };
}
