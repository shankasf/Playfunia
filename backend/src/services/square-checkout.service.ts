import { randomUUID } from 'crypto';
import type { CreatePaymentRequest, Money } from 'square';

import { getSquareClient, getSquareLocationId } from '../config/square';
import { appConfig } from '../config/env';
import { UserRepository, PaymentRepository, MembershipRepository, OrderRepository } from '../repositories';
import { AppError } from '../utils/app-error';
import { reserveTickets } from './ticket.service';
import { purchaseMembership } from './membership.service';

import type {
  SquareCheckoutIntentInput,
  SquareCheckoutFinalizeInput,
  SquareCheckoutItemInput,
  SquareGuestCheckoutIntentInput,
  SquareGuestCheckoutFinalizeInput,
} from '../schemas/square-checkout.schema';

const PROMO_CODES: Record<string, number> = {
  PLAYFUN10: 0.1,
  FAMILY15: 0.15,
};

const SIBLING_DISCOUNT_RATE = 0.05;

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
  total: number;
  lines: CheckoutLine[];
}

function roundCurrency(value: number) {
  return Math.round(value * 100) / 100;
}

function toSquareMoney(amount: number): Money {
  return {
    amount: BigInt(Math.round(amount * 100)),
    currency: 'USD',
  };
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
      const tierDiscounts: Record<string, number> = {
        explorer: 5,
        adventurer: 10,
        champion: 15,
      };
      membershipDiscount = tierDiscounts[membership.tier] ?? 0;
    }
  }

  return { user, membershipDiscount };
}

function calculateLine(item: SquareCheckoutItemInput, membershipDiscountPercent: number): CheckoutLine {
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

  const discounts: Array<{ label: string; amount: number }> = [];
  const subtotal = roundCurrency(item.unitPrice * item.quantity);

  if (item.quantity >= 2) {
    const siblingDiscount = roundCurrency(subtotal * SIBLING_DISCOUNT_RATE);
    if (siblingDiscount > 0) {
      discounts.push({ label: 'Sibling discount', amount: siblingDiscount });
    }
  }

  if (membershipDiscountPercent > 0) {
    const remaining = subtotal - discounts.reduce((sum, discount) => sum + discount.amount, 0);
    const membershipDiscount = roundCurrency(remaining * (membershipDiscountPercent / 100));
    if (membershipDiscount > 0) {
      discounts.push({ label: 'Membership discount', amount: membershipDiscount });
    }
  }

  const total = Math.max(
    roundCurrency(subtotal - discounts.reduce((sum, discount) => sum + discount.amount, 0)),
    0,
  );

  return {
    type: item.type,
    label: item.label,
    quantity: item.quantity,
    unitPrice: item.unitPrice,
    subtotal,
    discounts,
    total,
    metadata: item.metadata,
  };
}

function applyPromo(totalBeforePromo: number, promoCode?: string) {
  if (!promoCode) return 0;
  const rate = PROMO_CODES[promoCode.toUpperCase()] ?? 0;
  return roundCurrency(totalBeforePromo * rate);
}

async function buildSummary(
  userId: string,
  items: SquareCheckoutItemInput[],
  promoCode?: string,
): Promise<{
  summary: SquareCheckoutSummary;
  user: Awaited<ReturnType<typeof getUserWithMembership>>['user'];
}> {
  const { user, membershipDiscount } = await getUserWithMembership(userId);

  const lines = items.map(item => calculateLine(item, membershipDiscount));
  const subtotal = roundCurrency(lines.reduce((sum, line) => sum + line.subtotal, 0));
  const lineDiscountTotal = roundCurrency(
    lines.reduce(
      (sum, line) => sum + line.discounts.reduce((inner, discount) => inner + discount.amount, 0),
      0,
    ),
  );

  const totalBeforePromo = roundCurrency(subtotal - lineDiscountTotal);
  const promoDiscount = applyPromo(totalBeforePromo, promoCode);
  const total = Math.max(roundCurrency(totalBeforePromo - promoDiscount), 0);

  const discounts: Array<{ label: string; amount: number }> = [];
  if (lineDiscountTotal > 0) {
    discounts.push({ label: 'Line-item discounts', amount: lineDiscountTotal });
  }
  if (promoDiscount > 0) {
    discounts.push({ label: 'Promo code', amount: promoDiscount });
  }

  return {
    summary: {
      currency: 'usd',
      subtotal,
      discounts,
      total,
      lines,
    },
    user,
  };
}

function buildGuestSummary(items: SquareCheckoutItemInput[], promoCode?: string): SquareCheckoutSummary {
  const lines = items.map(item => calculateLine(item, 0));
  const subtotal = roundCurrency(lines.reduce((sum, line) => sum + line.subtotal, 0));
  const lineDiscountTotal = roundCurrency(
    lines.reduce(
      (sum, line) => sum + line.discounts.reduce((inner, discount) => inner + discount.amount, 0),
      0,
    ),
  );

  const totalBeforePromo = roundCurrency(subtotal - lineDiscountTotal);
  const promoDiscount = applyPromo(totalBeforePromo, promoCode);
  const total = Math.max(roundCurrency(totalBeforePromo - promoDiscount), 0);

  const discounts: Array<{ label: string; amount: number }> = [];
  if (lineDiscountTotal > 0) {
    discounts.push({ label: 'Line-item discounts', amount: lineDiscountTotal });
  }
  if (promoDiscount > 0) {
    discounts.push({ label: 'Promo code', amount: promoDiscount });
  }

  return {
    currency: 'usd',
    subtotal,
    discounts,
    total,
    lines,
  };
}

function assertSquareConfigured() {
  if (!appConfig.mockPayments && !appConfig.squareAccessToken) {
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
 * The frontend has already collected card info and generated a token (sourceId)
 */
export async function finalizeSquareCheckout(userId: string, input: SquareCheckoutFinalizeInput) {
  assertSquareConfigured();

  const { summary, user } = await buildSummary(userId, input.items, input.promoCode);

  if (summary.total <= 0) {
    throw new AppError('No payment is required for this cart', 400);
  }

  // Create order record
  const order = await OrderRepository.create({
    customer_id: user.customer_id ?? undefined,
    order_type: 'Mixed',
    status: 'Pending',
    subtotal_usd: summary.subtotal,
    discount_usd: summary.discounts.reduce((sum, d) => sum + d.amount, 0),
    tax_usd: 0,
    total_usd: summary.total,
    notes: `Square checkout: ${input.items.length} item(s)${input.promoCode ? `, promo: ${input.promoCode}` : ''}`,
  });

  let paymentId: string;
  let receiptUrl: string | null | undefined = null;

  // Mock payment mode
  if (appConfig.mockPayments) {
    paymentId = `mock_sq_${randomUUID()}`;

    await PaymentRepository.create({
      order_id: order.order_id,
      provider: 'square',
      provider_payment_id: paymentId,
      amount_usd: summary.total,
      status: 'Captured',
    });
  } else {
    // Real Square payment
    const square = getSquareClient();
    const locationId = getSquareLocationId();

    const paymentRequest: CreatePaymentRequest = {
      sourceId: input.sourceId,
      idempotencyKey: randomUUID(),
      amountMoney: toSquareMoney(summary.total),
      locationId,
      referenceId: `order_${order.order_id}`,
      note: `Playfunia checkout - ${input.items.length} item(s)`,
    };

    if (input.verificationToken) {
      paymentRequest.verificationToken = input.verificationToken;
    }

    const response = await square.payments.create(paymentRequest);

    if (!response.payment || response.payment.status !== 'COMPLETED') {
      // Update order status to failed
      await OrderRepository.update(order.order_id, { status: 'Failed' });
      throw new AppError('Payment failed. Please try again.', 400);
    }

    const payment = response.payment;
    if (!payment.id) {
      await OrderRepository.update(order.order_id, { status: 'Failed' });
      throw new AppError('Payment processing error. Please try again.', 500);
    }
    paymentId = payment.id;
    receiptUrl = payment.receiptUrl;

    await PaymentRepository.create({
      order_id: order.order_id,
      provider: 'square',
      provider_payment_id: paymentId,
      amount_usd: summary.total,
      status: 'Captured',
    });
  }

  // Update order status
  await OrderRepository.update(order.order_id, { status: 'Completed' });

  // Fulfill items
  const ticketResults: Array<{ cartIndex: number; ticket: unknown }> = [];
  const membershipResults: Array<{ cartIndex: number; membership: unknown }> = [];

  for (const [index, item] of input.items.entries()) {
    const line = summary.lines[index];
    if (!line) {
      throw new AppError('Checkout line could not be matched to payment summary', 400);
    }

    if (item.type === 'ticket') {
      const pricePerTicket = line.quantity > 0 ? roundCurrency(line.total / line.quantity) : item.unitPrice;
      const ticket = await reserveTickets({
        guardianId: userId,
        type: 'general',
        quantity: item.quantity,
        price: pricePerTicket,
        metadata: {
          ...(item.metadata ?? {}),
          label: item.label,
          promoCode: input.promoCode,
          discounts: line.discounts,
        },
      });
      ticketResults.push({ cartIndex: index, ticket });
    }

    if (item.type === 'membership') {
      const membership = await purchaseMembership(userId, {
        membershipId: item.membershipId,
        durationMonths: item.durationMonths,
        autoRenew: item.autoRenew,
      });
      membershipResults.push({ cartIndex: index, membership });
    }
  }

  return {
    paymentId,
    summary,
    tickets: ticketResults,
    memberships: membershipResults,
    receiptEmail: user.email ?? null,
    receiptUrl,
  };
}

/**
 * Create guest checkout intent
 */
export async function createSquareGuestCheckoutPaymentIntent(input: SquareGuestCheckoutIntentInput) {
  const summary = buildGuestSummary(input.items, input.promoCode);

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
 */
export async function finalizeSquareGuestCheckout(input: SquareGuestCheckoutFinalizeInput) {
  assertSquareConfigured();

  const summary = buildGuestSummary(input.items, input.promoCode);

  if (summary.total <= 0) {
    throw new AppError('No payment is required for this cart', 400);
  }

  // Create order record
  const order = await OrderRepository.create({
    customer_id: undefined,
    order_type: 'Mixed',
    status: 'Pending',
    subtotal_usd: summary.subtotal,
    discount_usd: summary.discounts.reduce((sum, d) => sum + d.amount, 0),
    tax_usd: 0,
    total_usd: summary.total,
    notes: `GUEST: ${input.guestFirstName} ${input.guestLastName} | ${input.guestEmail} | ${input.guestPhone}`,
  });

  let paymentId: string;
  let receiptUrl: string | null | undefined = null;

  // Mock payment mode
  if (appConfig.mockPayments) {
    paymentId = `mock_sq_guest_${randomUUID()}`;

    await PaymentRepository.create({
      order_id: order.order_id,
      provider: 'square',
      provider_payment_id: paymentId,
      amount_usd: summary.total,
      status: 'Captured',
    });
  } else {
    // Real Square payment
    const square = getSquareClient();
    const locationId = getSquareLocationId();

    const paymentRequest: CreatePaymentRequest = {
      sourceId: input.sourceId,
      idempotencyKey: randomUUID(),
      amountMoney: toSquareMoney(summary.total),
      locationId,
      referenceId: `guest_order_${order.order_id}`,
      note: `Guest checkout: ${input.guestFirstName} ${input.guestLastName}`,
      buyerEmailAddress: input.guestEmail,
    };

    if (input.verificationToken) {
      paymentRequest.verificationToken = input.verificationToken;
    }

    const response = await square.payments.create(paymentRequest);

    if (!response.payment || response.payment.status !== 'COMPLETED') {
      await OrderRepository.update(order.order_id, { status: 'Failed' });
      throw new AppError('Payment failed. Please try again.', 400);
    }

    const payment = response.payment;
    if (!payment.id) {
      await OrderRepository.update(order.order_id, { status: 'Failed' });
      throw new AppError('Payment processing error. Please try again.', 500);
    }
    paymentId = payment.id;
    receiptUrl = payment.receiptUrl;

    await PaymentRepository.create({
      order_id: order.order_id,
      provider: 'square',
      provider_payment_id: paymentId,
      amount_usd: summary.total,
      status: 'Captured',
    });
  }

  // Update order status
  await OrderRepository.update(order.order_id, { status: 'Completed' });

  // Fulfill tickets (guests can only buy tickets, not memberships)
  const ticketResults: Array<{ cartIndex: number; ticket: unknown }> = [];
  const guestGuardianId = `guest_${input.guestEmail}`;

  for (const [index, item] of input.items.entries()) {
    const line = summary.lines[index];
    if (!line) continue;

    if (item.type === 'ticket') {
      const pricePerTicket = line.quantity > 0 ? roundCurrency(line.total / line.quantity) : item.unitPrice;
      const ticket = await reserveTickets({
        guardianId: guestGuardianId,
        type: 'general',
        quantity: item.quantity,
        price: pricePerTicket,
        metadata: {
          ...(item.metadata ?? {}),
          label: item.label,
          guestName: `${input.guestFirstName} ${input.guestLastName}`,
          guestEmail: input.guestEmail,
          guestPhone: input.guestPhone,
          promoCode: input.promoCode,
          discounts: line.discounts,
        },
      });
      ticketResults.push({ cartIndex: index, ticket });
    }
  }

  return {
    paymentId,
    summary,
    tickets: ticketResults,
    memberships: [],
    receiptEmail: input.guestEmail,
    receiptUrl,
  };
}
