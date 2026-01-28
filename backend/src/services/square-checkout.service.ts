import { randomUUID } from 'crypto';
import type { CreatePaymentRequest, Money } from 'square';
import { DateTime } from 'luxon';

import { getSquareClient, getSquareLocationId } from '../config/square';
import { appConfig } from '../config/env';
import { UserRepository, PaymentRepository, MembershipRepository, MembershipPlanRepository, OrderRepository, PromotionRepository, PricingConfigRepository, CustomerRepository, PartyBookingRepository, PartyPackageRepository } from '../repositories';
import { AppError } from '../utils/app-error';
import { reserveTickets } from './ticket.service';
import { purchaseMembership } from './membership.service';
import { sendOrderConfirmation, sendBookingConfirmation, sendAdminBookingNotification, sendAdminTicketNotification, sendAdminMembershipNotification, type BookingEmailData } from './email.service';
import { sendOrderConfirmationSms, sendTicketConfirmationSms, sendBookingConfirmationSms, type BookingSmsData } from './sms.service';
import { generateReceiptPDF, generateBookingReceiptPDF, createReceiptRecord } from './receipt.service';

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
  taxAmount: number;
  total: number;
  lines: CheckoutLine[];
}

// Tax rate constant (8%)
const TAX_RATE = 0.08;

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

async function applyPromo(totalBeforePromo: number, promoCode?: string): Promise<number> {
  if (!promoCode) return 0;
  const rate = await getPromoDiscount(promoCode);
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
  // Reset cache for fresh pricing data
  cachedSiblingDiscountRate = null;

  const { user, membershipDiscount } = await getUserWithMembership(userId);

  // Calculate lines - no discounts applied
  const lines = await Promise.all(items.map(item => calculateLine(item, membershipDiscount)));
  const subtotal = roundCurrency(lines.reduce((sum, line) => sum + line.subtotal, 0));

  // Calculate tax (8%) - no discounts
  const taxAmount = roundCurrency(subtotal * TAX_RATE);
  const total = roundCurrency(subtotal + taxAmount);

  return {
    summary: {
      currency: 'usd',
      subtotal,
      discounts: [], // No discounts
      taxAmount,
      total,
      lines,
    },
    user,
  };
}

async function buildGuestSummary(items: SquareCheckoutItemInput[], _promoCode?: string): Promise<SquareCheckoutSummary> {
  // Calculate lines - no discounts applied
  const lines = await Promise.all(items.map(item => calculateLine(item, 0)));
  const subtotal = roundCurrency(lines.reduce((sum, line) => sum + line.subtotal, 0));

  // Calculate tax (8%) - no discounts
  const taxAmount = roundCurrency(subtotal * TAX_RATE);
  const total = roundCurrency(subtotal + taxAmount);

  return {
    currency: 'usd',
    subtotal,
    discounts: [], // No discounts
    taxAmount,
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

  const { summary, user } = await buildSummary(userId, input.items, input.promoCode);

  if (summary.total <= 0) {
    throw new AppError('No payment is required for this cart', 400);
  }

  // ============================================================
  // PHASE 1: PRE-VALIDATION (Before any payment)
  // ============================================================
  // Validate all items before charging the customer
  for (const item of input.items) {
    if (item.type === 'booking') {
      // Verify party package exists and get details
      const packageId = parseInt(item.packageId, 10);
      const partyPackage = await PartyPackageRepository.findById(packageId);
      if (!partyPackage) {
        throw new AppError(`Party package not found: ${item.label}`, 400);
      }

      // Verify slot is still available (critical - prevents double booking)
      const eventDate = DateTime.fromISO(item.eventDate);
      const [hour, minute] = item.startTime.split(':').map(Number);
      const startDateTime = eventDate.set({ hour, minute, second: 0, millisecond: 0 });
      const durationMinutes = partyPackage.duration_minutes ?? 120;
      const endDateTime = startDateTime.plus({ minutes: durationMinutes + 30 }); // +30 for cleaning buffer

      const existingBookings = await PartyBookingRepository.findByLocationAndDate(
        item.location,
        item.eventDate
      );

      const hasConflict = existingBookings.some(booking => {
        if (!booking.scheduled_start || !booking.scheduled_end) return false;
        const bookingStart = DateTime.fromISO(booking.scheduled_start);
        const bookingEnd = DateTime.fromISO(booking.scheduled_end);
        // Check for overlap
        return startDateTime < bookingEnd && endDateTime > bookingStart;
      });

      if (hasConflict) {
        throw new AppError(
          `The time slot ${item.startTime} on ${item.eventDate} at ${item.location} is no longer available. Please select a different time.`,
          409 // Conflict
        );
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
    notes: `Square checkout: ${input.items.length} item(s)${input.promoCode ? `, promo: ${input.promoCode}` : ''}`,
  });

  // Use order_id as part of idempotency key to prevent duplicate payments
  const idempotencyKey = `checkout_${order.order_id}_${input.sourceId.slice(-8)}`;

  let paymentId: string;
  let receiptUrl: string | null | undefined = null;

  // ============================================================
  // PHASE 3: PROCESS PAYMENT
  // ============================================================
  try {
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
      const square = getSquareClient();
      const locationId = getSquareLocationId();

      const paymentRequest: CreatePaymentRequest = {
        sourceId: input.sourceId,
        idempotencyKey,
        amountMoney: toSquareMoney(summary.total),
        locationId,
        referenceId: `order_${order.order_id}`,
        note: `Playfunia checkout - Order #${order.order_id}`,
        // Enable autocomplete to capture payment immediately
        autocomplete: true,
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
  } catch (paymentError) {
    // Update order to failed status
    await OrderRepository.update(order.order_id, { status: 'Failed' });
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
        const membership = await purchaseMembership(userId, {
          membershipId: item.membershipId,
          durationMonths: item.durationMonths,
          autoRenew: item.autoRenew,
        });
        membershipResults.push({ cartIndex: index, membership });
      }

      if (item.type === 'booking') {
        const packageId = parseInt(item.packageId, 10);
        const partyPackage = await PartyPackageRepository.findById(packageId);
        if (!partyPackage) {
          fulfillmentErrors.push(`Booking ${index}: Package not found`);
          continue;
        }

        // Calculate times
        const eventDate = DateTime.fromISO(item.eventDate);
        const [hour, minute] = item.startTime.split(':').map(Number);
        const startDateTime = eventDate.set({ hour, minute, second: 0, millisecond: 0 });
        const durationMinutes = partyPackage.duration_minutes ?? 120;
        const endDateTime = startDateTime.plus({ minutes: durationMinutes });

        // Generate unique reference
        const reference = `BK-${DateTime.now().toFormat('yyyyLLddHHmm')}-${randomUUID().slice(0, 8).toUpperCase()}`;

        // Get cleaning fee from pricing config or use default
        const cleaningFee = await PricingConfigRepository.getValue('cleaning_fee', 50);

        // Create the booking
        const booking = await PartyBookingRepository.create({
          package_id: packageId,
          customer_id: user.customer_id ?? null,
          scheduled_start: startDateTime.toISO() ?? startDateTime.toJSDate().toISOString(),
          scheduled_end: endDateTime.toISO() ?? endDateTime.toJSDate().toISOString(),
          reference,
          location_name: item.location,
          event_date: item.eventDate,
          start_time: item.startTime,
          end_time: endDateTime.toFormat('HH:mm'),
          guests: item.guestCount,
          notes: item.notes,
          add_ons: item.addOns ?? [],
          subtotal: item.unitPrice - cleaningFee,
          cleaning_fee: cleaningFee,
          total: item.unitPrice,
          deposit_amount: item.unitPrice,
          balance_remaining: 0,
          payment_status: 'paid',
          status: 'Confirmed',
          child_ids: item.childIds?.map(id => parseInt(id, 10)) ?? [],
        });

        bookingResults.push({ cartIndex: index, booking, item });
      }
    } catch (fulfillError) {
      const errorMsg = fulfillError instanceof Error ? fulfillError.message : 'Unknown error';
      fulfillmentErrors.push(`Item ${index} (${item.type}): ${errorMsg}`);
      console.error(`Fulfillment error for item ${index}:`, fulfillError);
    }
  }

  // ============================================================
  // PHASE 5: UPDATE ORDER STATUS
  // ============================================================
  // If there were fulfillment errors, mark as partially completed
  const finalStatus = fulfillmentErrors.length > 0 ? 'Partial' : 'Completed';
  await OrderRepository.update(order.order_id, {
    status: finalStatus,
    notes: fulfillmentErrors.length > 0
      ? `${order.order_id} - Fulfillment issues: ${fulfillmentErrors.join('; ')}`
      : undefined,
  });

  // ============================================================
  // PHASE 6: SEND NOTIFICATIONS (Async - Non-blocking)
  // ============================================================
  // Fire-and-forget pattern: don't block response waiting for emails
  // This is industry standard - customers see confirmation immediately
  const orderNumber = `PF-${order.order_id}`;
  const orderDate = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
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
        };
        const item = bookingResult.item as { type: 'booking'; packageId: string; unitPrice: number; guestCount: number; eventDate: string; startTime: string; label: string; location: string };

        // Get package details
        const packageId = parseInt(item.packageId, 10);
        const partyPackage = await PartyPackageRepository.findById(packageId);
        const packageName = partyPackage?.name ?? item.label;

        const reference = booking.reference ?? `PF-${booking.booking_id}`;
        const guestName = `${user.first_name ?? ''} ${user.last_name ?? ''}`.trim() || 'Customer';
        const eventDate = booking.event_date
          ? new Date(booking.event_date).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
          : item.eventDate;
        const startTime = booking.start_time ?? item.startTime;
        const location = booking.location_name ?? 'Albany';
        const guestCount = booking.guests ?? item.guestCount;
        const totalAmount = booking.total ?? item.unitPrice;
        const depositPaid = booking.deposit_amount ?? item.unitPrice;
        const balanceRemaining = booking.balance_remaining ?? 0;
        const subtotal = booking.subtotal ?? totalAmount;
        const cleaningFee = booking.cleaning_fee ?? 0;

        // Parse add-ons
        const addOns = (booking.add_ons ?? []) as Array<{ label?: string; name?: string; price: number; quantity: number }>;
        const formattedAddOns = addOns.map(a => ({
          name: a.label ?? a.name ?? 'Add-on',
          price: a.price,
          quantity: a.quantity ?? 1,
        }));

        // Generate receipt
        let receiptNumber: string | undefined;
        let receiptPdf: Buffer | undefined;

        try {
          const receiptResult = await createReceiptRecord({
            purchaseType: 'booking',
            referenceId: booking.booking_id,
            customerId: booking.customer_id ?? user.customer_id ?? null,
            subtotal: item.unitPrice,
            discount: 0,
            tax: 0,
            total: item.unitPrice,
            paymentMethod: 'Credit Card (Square)',
            paymentId: paymentId,
            metadata: {
              bookingReference: reference,
              packageName,
              eventDate: booking.event_date,
              startTime,
              location,
              guestCount,
              totalAmount,
              balanceRemaining,
            },
          });
          receiptNumber = receiptResult.receiptNumber;

          // Generate PDF with package details
          receiptPdf = await generateBookingReceiptPDF({
            receiptNumber,
            date: orderDate,
            customerName: guestName,
            customerEmail: user.email ?? '',
            bookingReference: reference,
            packageName,
            eventDate,
            startTime,
            location,
            guestCount,
            subtotal,
            cleaningFee,
            addOns: formattedAddOns.length > 0 ? formattedAddOns : undefined,
            depositAmount: item.unitPrice, // Full payment - no deposit
            balanceRemaining,
            total: totalAmount,
            paymentMethod: 'Credit Card (Square)',
            paymentId,
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
        }

        // Send booking confirmation email
        const emailData: BookingEmailData = {
          reference,
          guestName,
          email: user.email,
          eventDate,
          startTime,
          location,
          packageName,
          guestCount,
          depositAmount: item.unitPrice, // Full payment - no deposit
          totalAmount,
          balanceRemaining,
          addOns: formattedAddOns.length > 0 ? formattedAddOns : undefined,
          receiptPdf,
          receiptNumber,
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
      const nonBookingTotal = nonBookingLines.reduce((sum, l) => sum + l.total, 0);

      try {
        // Generate PDF receipt for non-booking items
        const receiptPdf = await generateReceiptPDF({
          receiptNumber: orderNumber,
          date: orderDate,
          customerName: `${user.first_name ?? ''} ${user.last_name ?? ''}`.trim() || 'Customer',
          customerEmail: user.email,
          items: emailItems,
          subtotal: nonBookingSubtotal,
          taxAmount: summary.taxAmount,
          discounts: summary.discounts,
          total: nonBookingTotal,
          paymentMethod: 'Credit Card (Square)',
          paymentId,
        });

        // Send confirmation email for non-booking items
        await sendOrderConfirmation({
          email: user.email,
          customerName: user.first_name ?? 'Customer',
          orderNumber,
          orderDate,
          items: emailItems,
          subtotal: nonBookingSubtotal,
          taxAmount: summary.taxAmount,
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
              orderNumber,
              customerName: `${user.first_name ?? ''} ${user.last_name ?? ''}`.trim() || 'Customer',
              customerEmail: user.email,
              customerPhone: user.phone ?? undefined,
              customerId: user.customer_id?.toString(),
              tickets: adminTicketItems,
              subtotal: nonBookingSubtotal,
              taxAmount: summary.taxAmount,
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
                startDate: membership.startedAt ? new Date(membership.startedAt).toLocaleDateString() : orderDate,
                expiryDate: membership.expiresAt ? new Date(membership.expiresAt).toLocaleDateString() : 'N/A',
                visitsPerMonth: membership.visitsPerMonth ?? null,
                monthlyPrice: membership.monthlyPrice ?? line?.unitPrice ?? 0,
                totalPaid: line?.total ?? 0,
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
  const summary = await buildGuestSummary(input.items, input.promoCode);

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

  const summary = await buildGuestSummary(input.items, input.promoCode);

  if (summary.total <= 0) {
    throw new AppError('No payment is required for this cart', 400);
  }

  // ============================================================
  // PHASE 1: PRE-VALIDATION (Before any payment)
  // ============================================================
  for (const item of input.items) {
    if (item.type === 'booking') {
      const packageId = parseInt(item.packageId, 10);
      const partyPackage = await PartyPackageRepository.findById(packageId);
      if (!partyPackage) {
        throw new AppError(`Party package not found: ${item.label}`, 400);
      }

      // Verify slot availability before charging
      const eventDate = DateTime.fromISO(item.eventDate);
      const [hour, minute] = item.startTime.split(':').map(Number);
      const startDateTime = eventDate.set({ hour, minute, second: 0, millisecond: 0 });
      const durationMinutes = partyPackage.duration_minutes ?? 120;
      const endDateTime = startDateTime.plus({ minutes: durationMinutes + 30 });

      const existingBookings = await PartyBookingRepository.findByLocationAndDate(
        item.location,
        item.eventDate
      );

      const hasConflict = existingBookings.some(booking => {
        if (!booking.scheduled_start || !booking.scheduled_end) return false;
        const bookingStart = DateTime.fromISO(booking.scheduled_start);
        const bookingEnd = DateTime.fromISO(booking.scheduled_end);
        return startDateTime < bookingEnd && endDateTime > bookingStart;
      });

      if (hasConflict) {
        throw new AppError(
          `The time slot ${item.startTime} on ${item.eventDate} at ${item.location} is no longer available.`,
          409
        );
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
    notes: `Guest checkout: ${input.guestFirstName} ${input.guestLastName}`,
  });

  const idempotencyKey = `guest_checkout_${order.order_id}_${input.sourceId.slice(-8)}`;

  let paymentId: string;
  let receiptUrl: string | null | undefined = null;

  // ============================================================
  // PHASE 4: PROCESS PAYMENT
  // ============================================================
  try {
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
      const square = getSquareClient();
      const locationId = getSquareLocationId();

      const paymentRequest: CreatePaymentRequest = {
        sourceId: input.sourceId,
        idempotencyKey,
        amountMoney: toSquareMoney(summary.total),
        locationId,
        referenceId: `guest_order_${order.order_id}`,
        note: `Guest checkout - Order #${order.order_id}`,
        buyerEmailAddress: input.guestEmail,
        autocomplete: true,
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
  } catch (paymentError) {
    await OrderRepository.update(order.order_id, { status: 'Failed' });
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

        const eventDate = DateTime.fromISO(item.eventDate);
        const [hour, minute] = item.startTime.split(':').map(Number);
        const startDateTime = eventDate.set({ hour, minute, second: 0, millisecond: 0 });
        const durationMinutes = partyPackage.duration_minutes ?? 120;
        const endDateTime = startDateTime.plus({ minutes: durationMinutes });

        const reference = `BK-${DateTime.now().toFormat('yyyyLLddHHmm')}-${randomUUID().slice(0, 8).toUpperCase()}`;
        const cleaningFee = await PricingConfigRepository.getValue('cleaning_fee', 50);

        const booking = await PartyBookingRepository.create({
          package_id: packageId,
          customer_id: guestCustomer.customer_id,
          scheduled_start: startDateTime.toISO() ?? startDateTime.toJSDate().toISOString(),
          scheduled_end: endDateTime.toISO() ?? endDateTime.toJSDate().toISOString(),
          reference,
          location_name: item.location,
          event_date: item.eventDate,
          start_time: item.startTime,
          end_time: endDateTime.toFormat('HH:mm'),
          guests: item.guestCount,
          notes: item.notes,
          add_ons: item.addOns ?? [],
          subtotal: item.unitPrice - cleaningFee,
          cleaning_fee: cleaningFee,
          total: item.unitPrice,
          deposit_amount: item.unitPrice,
          balance_remaining: 0,
          payment_status: 'paid',
          status: 'Confirmed',
          guest_name: `${input.guestFirstName} ${input.guestLastName}`,
          guest_email: input.guestEmail,
          guest_phone: input.guestPhone,
        });

        bookingResults.push({ cartIndex: index, booking, item });
      }
    } catch (fulfillError) {
      const errorMsg = fulfillError instanceof Error ? fulfillError.message : 'Unknown error';
      fulfillmentErrors.push(`Item ${index} (${item.type}): ${errorMsg}`);
      console.error(`Guest fulfillment error for item ${index}:`, fulfillError);
    }
  }

  // ============================================================
  // PHASE 6: UPDATE ORDER STATUS
  // ============================================================
  const finalStatus = fulfillmentErrors.length > 0 ? 'Partial' : 'Completed';
  await OrderRepository.update(order.order_id, { status: finalStatus });

  // ============================================================
  // PHASE 7: SEND NOTIFICATIONS (Async - Non-blocking)
  // ============================================================
  const orderNumber = `PF-${order.order_id}`;
  const orderDate = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
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
      };
      const item = bookingResult.item as { type: 'booking'; packageId: string; unitPrice: number; guestCount: number; eventDate: string; startTime: string; label: string; location: string };

      // Get package details
      const packageId = parseInt(item.packageId, 10);
      const partyPackage = await PartyPackageRepository.findById(packageId);
      const packageName = partyPackage?.name ?? item.label;

      const reference = booking.reference ?? `PF-${booking.booking_id}`;
      const guestName = `${input.guestFirstName} ${input.guestLastName}`;
      const eventDate = booking.event_date
        ? new Date(booking.event_date).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
        : item.eventDate;
      const startTime = booking.start_time ?? item.startTime;
      const location = booking.location_name ?? 'Albany';
      const guestCount = booking.guests ?? item.guestCount;
      const totalAmount = booking.total ?? item.unitPrice;
      const depositPaid = booking.deposit_amount ?? item.unitPrice;
      const balanceRemaining = booking.balance_remaining ?? 0;
      const subtotal = booking.subtotal ?? totalAmount;
      const cleaningFee = booking.cleaning_fee ?? 0;

      // Parse add-ons
      const addOns = (booking.add_ons ?? []) as Array<{ label?: string; name?: string; price: number; quantity: number }>;
      const formattedAddOns = addOns.map(a => ({
        name: a.label ?? a.name ?? 'Add-on',
        price: a.price,
        quantity: a.quantity ?? 1,
      }));

      // Generate receipt
      let receiptNumber: string | undefined;
      let receiptPdf: Buffer | undefined;

      try {
        const receiptResult = await createReceiptRecord({
          purchaseType: 'booking',
          referenceId: booking.booking_id,
          customerId: booking.customer_id ?? guestCustomer.customer_id ?? null,
          subtotal: item.unitPrice,
          discount: 0,
          tax: 0,
          total: item.unitPrice,
          paymentMethod: 'Credit Card (Square)',
          paymentId: paymentId,
          metadata: {
            bookingReference: reference,
            packageName,
            eventDate: booking.event_date,
            startTime,
            location,
            guestCount,
            totalAmount,
            balanceRemaining,
          },
        });
        receiptNumber = receiptResult.receiptNumber;

        // Generate PDF with package details
        receiptPdf = await generateBookingReceiptPDF({
          receiptNumber,
          date: orderDate,
          customerName: guestName,
          customerEmail: input.guestEmail,
          bookingReference: reference,
          packageName,
          eventDate,
          startTime,
          location,
          guestCount,
          subtotal,
          cleaningFee,
          addOns: formattedAddOns.length > 0 ? formattedAddOns : undefined,
          depositAmount: item.unitPrice,
          balanceRemaining,
          total: totalAmount,
          paymentMethod: 'Credit Card (Square)',
          paymentId,
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
        console.error('Failed to generate guest booking receipt:', receiptError);
      }

      // Send booking confirmation email
      const emailData: BookingEmailData = {
        reference,
        guestName,
        email: input.guestEmail,
        eventDate,
        startTime,
        location,
        packageName,
        guestCount,
        depositAmount: item.unitPrice,
        totalAmount,
        balanceRemaining,
        addOns: formattedAddOns.length > 0 ? formattedAddOns : undefined,
        receiptPdf,
        receiptNumber,
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
    const nonBookingTotal = nonBookingLines.reduce((sum, l) => sum + l.total, 0);

    try {
      // Generate PDF receipt
      const receiptPdf = await generateReceiptPDF({
        receiptNumber: orderNumber,
        date: orderDate,
        customerName: `${input.guestFirstName} ${input.guestLastName}`,
        customerEmail: input.guestEmail,
        items: emailItems,
        subtotal: nonBookingSubtotal,
        taxAmount: summary.taxAmount,
        discounts: summary.discounts,
        total: nonBookingTotal,
        paymentMethod: 'Credit Card (Square)',
        paymentId,
      });

      // Send confirmation email
      await sendOrderConfirmation({
        email: input.guestEmail,
        customerName: input.guestFirstName,
        orderNumber,
        orderDate,
        items: emailItems,
        subtotal: nonBookingSubtotal,
        taxAmount: summary.taxAmount,
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
            orderNumber,
            customerName: `${input.guestFirstName} ${input.guestLastName}`,
            customerEmail: input.guestEmail,
            customerPhone: input.guestPhone ?? undefined,
            customerId: guestCustomer?.customer_id?.toString(),
            tickets: adminTicketItems,
            subtotal: nonBookingSubtotal,
            taxAmount: summary.taxAmount,
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
