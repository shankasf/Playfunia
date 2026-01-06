import type Stripe from 'stripe';
import { randomUUID } from 'crypto';

import { getStripeClient } from '../config/stripe';
import { appConfig } from '../config/env';
import { UserRepository, PaymentRepository, MembershipRepository, MembershipPlanRepository, OrderRepository, PromotionRepository, PricingConfigRepository } from '../repositories';
import { AppError } from '../utils/app-error';
import { reserveTickets } from './ticket.service';
import { purchaseMembership } from './membership.service';

import type {
  CheckoutIntentInput,
  CheckoutFinalizeInput,
  CheckoutItemInput,
  GuestCheckoutIntentInput,
  GuestCheckoutFinalizeInput,
} from '../schemas/checkout.schema';

// Tier name mapping for database plans (same as membership.service.ts)
const REVERSE_TIER_MAP: Record<string, string[]> = {
  'explorer': ['Silver'],
  'adventurer': ['Gold'],
  'champion': ['Platinum', 'VIP Platinum'],
};

// Cache for pricing config values (refreshed on each checkout)
let cachedSiblingDiscountRate: number | null = null;

async function getSiblingDiscountRate(): Promise<number> {
  if (cachedSiblingDiscountRate === null) {
    cachedSiblingDiscountRate = await PricingConfigRepository.getValue('sibling_discount_rate', 5);
  }
  return cachedSiblingDiscountRate / 100; // Convert from percentage to decimal
}

async function getPromoDiscount(promoCode: string): Promise<number> {
  const promo = await PromotionRepository.findByCode(promoCode);
  if (!promo) return 0;

  // Check if promo is still valid
  const now = new Date();
  if (promo.valid_from && new Date(promo.valid_from) > now) return 0;
  if (promo.valid_until && new Date(promo.valid_until) < now) return 0;
  if (promo.max_redemptions && promo.redemptions >= promo.max_redemptions) return 0;

  // Return percentage as decimal (e.g., 10 -> 0.10)
  if (promo.percent_off) return promo.percent_off / 100;

  return 0;
}

interface CheckoutLine {
  type: CheckoutItemInput['type'];
  label: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
  discounts: Array<{ label: string; amount: number }>;
  total: number;
  metadata?: Record<string, unknown> | undefined;
}

export interface CheckoutSummary {
  currency: string;
  subtotal: number;
  discounts: Array<{ label: string; amount: number }>;
  total: number;
  lines: CheckoutLine[];
}

function roundCurrency(value: number) {
  return Math.round(value * 100) / 100;
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

  // Check if user has active membership
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

async function calculateLine(item: CheckoutItemInput, membershipDiscountPercent: number): Promise<CheckoutLine> {
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

  // Fetch sibling discount rate from database
  if (item.quantity >= 2) {
    const siblingDiscountRate = await getSiblingDiscountRate();
    const siblingDiscount = roundCurrency(subtotal * siblingDiscountRate);
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

async function applyPromo(totalBeforePromo: number, promoCode?: string): Promise<number> {
  if (!promoCode) return 0;
  const rate = await getPromoDiscount(promoCode);
  return roundCurrency(totalBeforePromo * rate);
}

async function buildSummary(
  userId: string,
  items: CheckoutItemInput[],
  promoCode?: string,
): Promise<{
  summary: CheckoutSummary;
  user: Awaited<ReturnType<typeof getUserWithMembership>>['user'];
}> {
  // Reset cache for fresh pricing data
  cachedSiblingDiscountRate = null;

  const { user, membershipDiscount } = await getUserWithMembership(userId);

  // Calculate lines with async discount lookups
  const lines = await Promise.all(items.map(item => calculateLine(item, membershipDiscount)));
  const subtotal = roundCurrency(lines.reduce((sum, line) => sum + line.subtotal, 0));
  const lineDiscountTotal = roundCurrency(
    lines.reduce(
      (sum, line) => sum + line.discounts.reduce((inner, discount) => inner + discount.amount, 0),
      0,
    ),
  );

  const totalBeforePromo = roundCurrency(subtotal - lineDiscountTotal);
  const promoDiscount = await applyPromo(totalBeforePromo, promoCode);
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

function assertStripeConfigured() {
  if (!appConfig.mockPayments && !appConfig.stripeSecretKey) {
    throw new AppError('Payments are temporarily unavailable. Please try again later.', 503);
  }
}

export async function createCheckoutPaymentIntent(userId: string, input: CheckoutIntentInput) {
  assertStripeConfigured();

  const { summary, user } = await buildSummary(userId, input.items, input.promoCode);
  if (summary.total <= 0) {
    throw new AppError('No payment is required for this cart', 400);
  }

  const amountInCents = Math.round(summary.total * 100);

  // Mock payment mode - create order and payment without Stripe
  if (appConfig.mockPayments) {
    const mockIntentId = `mock_pi_${randomUUID()}`;
    const mockClientSecret = `mock_secret_${randomUUID()}`;

    // Create an order for the checkout
    const order = await OrderRepository.create({
      customer_id: user.customer_id ?? undefined,
      order_type: 'Mixed',
      status: 'Pending',
      subtotal_usd: summary.subtotal,
      discount_usd: summary.discounts.reduce((sum, d) => sum + d.amount, 0),
      tax_usd: 0,
      total_usd: summary.total,
      notes: `Checkout: ${input.items.length} item(s)${input.promoCode ? `, promo: ${input.promoCode}` : ''}`,
    });

    // Create payment record linked to the order
    await PaymentRepository.create({
      order_id: order.order_id,
      stripe_payment_intent_id: mockIntentId,
      amount_usd: summary.total,
      status: 'Pending',
    });

    return {
      clientSecret: mockClientSecret,
      paymentIntentId: mockIntentId,
      amount: summary.total,
      currency: 'usd',
      summary,
      promoCode: input.promoCode,
      mock: true,
    };
  }

  const stripe = getStripeClient();
  const receiptEmail = user.email ?? undefined;

  const intentParams: Stripe.PaymentIntentCreateParams = {
    amount: amountInCents,
    currency: summary.currency,
    metadata: {
      promoCode: input.promoCode ?? '',
      itemCount: String(input.items.length),
      userId,
    },
    automatic_payment_methods: { enabled: true },
  };

  if (receiptEmail) {
    intentParams.receipt_email = receiptEmail;
  }

  const intent = await stripe.paymentIntents.create(intentParams);

  // Create payment record - using a dummy order_id for checkout payments
  await PaymentRepository.create({
    order_id: 0, // Will be updated when order is created
    stripe_payment_intent_id: intent.id,
    amount_usd: summary.total,
    status: 'Pending',
  });

  return {
    clientSecret: intent.client_secret,
    paymentIntentId: intent.id,
    amount: summary.total,
    currency: intent.currency ?? 'usd',
    summary,
    promoCode: input.promoCode,
  };
}

export async function finalizeCheckout(userId: string, input: CheckoutFinalizeInput) {
  assertStripeConfigured();

  const { summary, user } = await buildSummary(userId, input.items, input.promoCode);

  // Mock payment mode - skip Stripe verification
  if (appConfig.mockPayments) {
    const ticketResults: Array<{ cartIndex: number; ticket: unknown }> = [];
    const membershipResults: Array<{ cartIndex: number; membership: unknown }> = [];

    for (const [index, item] of input.items.entries()) {
      const line = summary.lines[index];
      if (!line) {
        throw new AppError('Checkout line could not be matched to payment summary', 400);
      }
      if (item.type === 'ticket') {
        const pricePerTicket =
          line.quantity > 0 ? roundCurrency(line.total / line.quantity) : item.unitPrice;
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

    // Update payment record
    const payment = await PaymentRepository.findByStripePaymentIntentId(input.paymentIntentId);
    if (payment) {
      await PaymentRepository.update(payment.payment_id, { status: 'Captured' });
    }

    return {
      paymentIntentId: input.paymentIntentId,
      summary,
      tickets: ticketResults,
      memberships: membershipResults,
      receiptEmail: user.email ?? null,
    };
  }

  const stripe = getStripeClient();
  const intent = await stripe.paymentIntents.retrieve(input.paymentIntentId);

  if (intent.status !== 'succeeded') {
    throw new AppError('Payment is not complete yet. Please try again.', 400);
  }

  const received = intent.amount_received ?? intent.amount ?? 0;
  const expected = Math.round(summary.total * 100);
  if (received < expected) {
    throw new AppError('Payment amount does not match the order total', 400);
  }

  const ticketResults: Array<{ cartIndex: number; ticket: unknown }> = [];
  const membershipResults: Array<{ cartIndex: number; membership: unknown }> = [];

  for (const [index, item] of input.items.entries()) {
    const line = summary.lines[index];
    if (!line) {
      throw new AppError('Checkout line could not be matched to payment summary', 400);
    }
    if (item.type === 'ticket') {
      const pricePerTicket =
        line.quantity > 0 ? roundCurrency(line.total / line.quantity) : item.unitPrice;
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

  // Update payment record
  const payment = await PaymentRepository.findByStripePaymentIntentId(input.paymentIntentId);
  if (payment) {
    await PaymentRepository.update(payment.payment_id, { status: 'Captured' });
  }

  return {
    paymentIntentId: intent.id,
    summary,
    tickets: ticketResults,
    memberships: membershipResults,
    receiptEmail: intent.receipt_email ?? user.email ?? null,
  };
}

// Guest checkout functions
async function buildGuestSummary(items: CheckoutItemInput[], promoCode?: string): Promise<CheckoutSummary> {
  // Reset cache for fresh pricing data
  cachedSiblingDiscountRate = null;

  // Calculate lines with async discount lookups (no membership discount for guests)
  const lines = await Promise.all(items.map(item => calculateLine(item, 0)));
  const subtotal = roundCurrency(lines.reduce((sum, line) => sum + line.subtotal, 0));
  const lineDiscountTotal = roundCurrency(
    lines.reduce(
      (sum, line) => sum + line.discounts.reduce((inner, discount) => inner + discount.amount, 0),
      0,
    ),
  );

  const totalBeforePromo = roundCurrency(subtotal - lineDiscountTotal);
  const promoDiscount = await applyPromo(totalBeforePromo, promoCode);
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

export async function createGuestCheckoutPaymentIntent(input: GuestCheckoutIntentInput) {
  assertStripeConfigured();

  const summary = await buildGuestSummary(input.items, input.promoCode);
  if (summary.total <= 0) {
    throw new AppError('No payment is required for this cart', 400);
  }

  const amountInCents = Math.round(summary.total * 100);

  // Mock payment mode
  if (appConfig.mockPayments) {
    const mockIntentId = `mock_pi_${randomUUID()}`;
    const mockClientSecret = `mock_secret_${randomUUID()}`;

    // Create an order for the guest checkout
    const order = await OrderRepository.create({
      customer_id: undefined, // Guest - no customer account
      order_type: 'Mixed',
      status: 'Pending',
      subtotal_usd: summary.subtotal,
      discount_usd: summary.discounts.reduce((sum, d) => sum + d.amount, 0),
      total_usd: summary.total,
      notes: `GUEST: ${input.guestFirstName} ${input.guestLastName} | ${input.guestEmail} | ${input.guestPhone}`,
    });

    await PaymentRepository.create({
      order_id: order.order_id,
      stripe_payment_intent_id: mockIntentId,
      amount_usd: summary.total,
      status: 'Pending',
    });

    return {
      clientSecret: mockClientSecret,
      paymentIntentId: mockIntentId,
      summary,
      mock: true,
    };
  }

  // Real Stripe payment
  const stripe = getStripeClient();
  const intent = await stripe.paymentIntents.create({
    amount: amountInCents,
    currency: summary.currency,
    receipt_email: input.guestEmail,
    metadata: {
      guestName: `${input.guestFirstName} ${input.guestLastName}`,
      guestEmail: input.guestEmail,
      guestPhone: input.guestPhone,
      itemCount: input.items.length.toString(),
    },
  });

  // Create an order for the guest checkout
  const order = await OrderRepository.create({
    customer_id: undefined,
    order_type: 'Mixed',
    status: 'Pending',
    subtotal_usd: summary.subtotal,
    discount_usd: summary.discounts.reduce((sum, d) => sum + d.amount, 0),
    total_usd: summary.total,
    notes: `GUEST: ${input.guestFirstName} ${input.guestLastName} | ${input.guestEmail} | ${input.guestPhone}`,
  });

  await PaymentRepository.create({
    order_id: order.order_id,
    stripe_payment_intent_id: intent.id,
    amount_usd: summary.total,
    status: 'Pending',
  });

  if (!intent.client_secret) {
    throw new AppError('Failed to create payment intent', 500);
  }

  return {
    clientSecret: intent.client_secret,
    paymentIntentId: intent.id,
    summary,
    mock: false,
  };
}

export async function finalizeGuestCheckout(input: GuestCheckoutFinalizeInput) {
  const summary = await buildGuestSummary(input.items, input.promoCode);

  // Mock mode - auto-succeed
  if (appConfig.mockPayments) {
    const ticketResults: Array<{ cartIndex: number; ticket: Awaited<ReturnType<typeof reserveTickets>> }> = [];

    // Use guest email as a unique identifier for tickets
    const guestGuardianId = `guest_${input.guestEmail}`;

    for (let index = 0; index < input.items.length; index++) {
      const item = input.items[index];
      const line = summary.lines[index];

      if (item && item.type === 'ticket' && line) {
        // Prevent division by zero - use unitPrice as fallback
        const pricePerTicket = item.quantity > 0 ? line.total / item.quantity : item.unitPrice;
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
      // Note: Memberships require an account, so guests can only buy tickets
    }

    // Update payment record
    const payment = await PaymentRepository.findByStripePaymentIntentId(input.paymentIntentId);
    if (payment) {
      await PaymentRepository.update(payment.payment_id, { status: 'Captured' });
    }

    return {
      paymentIntentId: input.paymentIntentId,
      summary,
      tickets: ticketResults,
      memberships: [],
      receiptEmail: input.guestEmail,
    };
  }

  // Real Stripe verification
  const stripe = getStripeClient();
  const intent = await stripe.paymentIntents.retrieve(input.paymentIntentId);

  if (intent.status !== 'succeeded') {
    throw new AppError('Payment has not been completed', 400);
  }

  const ticketResults: Array<{ cartIndex: number; ticket: Awaited<ReturnType<typeof reserveTickets>> }> = [];

  // Use guest email as a unique identifier for tickets
  const guestGuardianId = `guest_${input.guestEmail}`;

  for (let index = 0; index < input.items.length; index++) {
    const item = input.items[index];
    const line = summary.lines[index];

    if (item && item.type === 'ticket' && line) {
      // Prevent division by zero - use unitPrice as fallback
      const pricePerTicket = item.quantity > 0 ? line.total / item.quantity : item.unitPrice;
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

  // Update payment record
  const payment = await PaymentRepository.findByStripePaymentIntentId(input.paymentIntentId);
  if (payment) {
    await PaymentRepository.update(payment.payment_id, { status: 'Captured' });
  }

  return {
    paymentIntentId: intent.id,
    summary,
    tickets: ticketResults,
    memberships: [],
    receiptEmail: intent.receipt_email ?? input.guestEmail,
  };
}
