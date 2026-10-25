/**
 * Membership Auto-Renew Billing
 *
 * - Stores the card from a membership purchase in Square (card on file) when
 *   the member opted into auto-renew.
 * - Charges that card on the membership's end date and extends the membership
 *   by renewal_months. Declines are retried once a day during the 2-day grace
 *   period, then the membership expires through the normal renewal job.
 *
 * Double-charge protection: every period gets one membership_renewals row
 * (unique membership_id + period_end) that must be claimed before charging,
 * and every attempt uses a deterministic Square idempotency key.
 *
 * Charging only runs when MEMBERSHIP_AUTOCHARGE_ENABLED=true.
 */

import type { CreatePaymentRequest } from 'square';
import { DateTime } from 'luxon';

import { appConfig } from '../config/env';
import { getSquareClient, getSquareLocationId } from '../config/square';
import { supabaseAny } from '../config/supabase';
import { CustomerRepository, MembershipRepository, OrderRepository, PaymentRepository } from '../repositories';
import { calculateTaxCents, centsToDollars, dollarsToCents, toSquareMoney } from '../utils/currency';
import { logger } from '../utils/logger';
import { withRetry } from '../utils/retry';
import { sendMembershipConfirmation, sendMembershipExpirationReminder } from './email.service';
import { getPlanByTier } from './membership.service';
import { getTaxRate } from './pricing-config.service';
import { createItemizedSquareOrder } from './square-order.service';

const BUSINESS_TZ = 'America/New_York';
/** Charge attempts per period: end date + 2 grace days */
const MAX_RENEWAL_ATTEMPTS = 3;
const VALID_PAYMENT_STATUSES = ['COMPLETED', 'APPROVED'];

type MembershipWithCustomer = {
  membership_id: number;
  customer_id: number;
  tier: string;
  end_date: string | null;
  renewal_months?: number | null;
  square_card_id?: string | null;
  display_id?: string | null;
  visits_per_month?: number | null;
  customers?: { full_name?: string | null; email?: string | null } | null;
};

function getSquareErrorDetail(error: unknown): string {
  if (error && typeof error === 'object' && 'errors' in error && Array.isArray((error as { errors: unknown[] }).errors)) {
    const first = (error as { errors: Array<{ code?: string; detail?: string }> }).errors[0];
    return [first?.code, first?.detail].filter(Boolean).join(': ') || 'Square API error';
  }
  return error instanceof Error ? error.message : String(error);
}

/**
 * Find or create the Square customer that owns this customer's stored cards.
 */
export async function ensureSquareCustomer(customerId: number): Promise<string> {
  const customer = await CustomerRepository.findById(customerId);
  if (!customer) throw new Error(`Customer ${customerId} not found`);
  if (customer.square_customer_id) return customer.square_customer_id;

  const [givenName, ...rest] = (customer.full_name ?? '').trim().split(/\s+/);
  const response = await withRetry(
    () => getSquareClient().customers.create({
      idempotencyKey: `playfunia_customer_${customerId}`,
      givenName: givenName || undefined,
      familyName: rest.join(' ') || undefined,
      emailAddress: customer.email ?? undefined,
      referenceId: `customer_${customerId}`,
    }),
    { maxRetries: 2, operationName: 'squareCustomerCreate' }
  );
  const squareCustomerId = response.customer?.id;
  if (!squareCustomerId) throw new Error('Square did not return a customer id');

  await CustomerRepository.update(customerId, { square_customer_id: squareCustomerId });
  return squareCustomerId;
}

/**
 * Save the card used for a completed payment so auto-renew can charge it later.
 * Never throws: a membership purchase must not fail because the card can't be
 * stored (e.g. Apple Pay / Google Pay cards). Returns the card id or null.
 */
export async function storeCardForAutoRenew(params: {
  paymentId: string;
  membershipIds: number[];
}): Promise<string | null> {
  const { paymentId, membershipIds } = params;
  if (membershipIds.length === 0) return null;

  let customerId: number | undefined;
  try {
    const membership = await MembershipRepository.findById(membershipIds[0]!);
    customerId = membership?.customer_id;
    if (!customerId) throw new Error(`Membership ${membershipIds[0]} not found`);
    const squareCustomerId = await ensureSquareCustomer(customerId);
    const response = await withRetry(
      () => getSquareClient().cards.create({
        idempotencyKey: `card_${paymentId}`.slice(0, 45),
        sourceId: paymentId,
        card: { customerId: squareCustomerId, referenceId: `customer_${customerId}` },
      }),
      { maxRetries: 2, operationName: 'squareCardCreate' }
    );
    const cardId = response.card?.id;
    if (!cardId) throw new Error('Square did not return a card id');

    for (const membershipId of membershipIds) {
      await MembershipRepository.update(membershipId, { square_card_id: cardId });
    }
    logger.info({ customerId, membershipIds, cardLast4: response.card?.last4 }, 'Stored card on file for membership auto-renew');
    return cardId;
  } catch (error) {
    logger.warn({ customerId, membershipIds, detail: getSquareErrorDetail(error) }, 'Could not store card for auto-renew — member will get renewal reminders instead');
    return null;
  }
}

/**
 * Disable a stored card in Square (when the member turns auto-renew off).
 * Best effort: logs and continues on failure.
 */
export async function disableStoredCard(cardId: string): Promise<void> {
  try {
    await getSquareClient().cards.disable({ cardId });
  } catch (error) {
    logger.warn({ cardId, detail: getSquareErrorDetail(error) }, 'Failed to disable stored card');
  }
}

async function hasQueuedSuccessor(m: MembershipWithCustomer): Promise<boolean> {
  const { data, error } = await supabaseAny
    .from('memberships')
    .select('membership_id')
    .eq('customer_id', m.customer_id)
    .eq('tier', m.tier)
    .eq('status', 'pending')
    .limit(1);
  if (error) throw error;
  return (data ?? []).length > 0;
}

/**
 * Claim the right to charge one billing period. Returns the attempt number, or
 * null if this period is already renewed, in progress, out of retries, or was
 * already attempted today.
 */
async function claimRenewalAttempt(membershipId: number, periodEnd: string, today: string): Promise<number | null> {
  const { error: insertError } = await supabaseAny
    .from('membership_renewals')
    .insert({ membership_id: membershipId, period_end: periodEnd, status: 'processing', attempts: 1, last_attempt_on: today });
  if (!insertError) return 1;
  if (insertError.code !== '23505') throw insertError;

  const { data: existing, error: selectError } = await supabaseAny
    .from('membership_renewals')
    .select('renewal_id, status, attempts, last_attempt_on')
    .eq('membership_id', membershipId)
    .eq('period_end', periodEnd)
    .single();
  if (selectError) throw selectError;
  if (existing.status !== 'failed' || existing.attempts >= MAX_RENEWAL_ATTEMPTS || existing.last_attempt_on >= today) {
    return null;
  }

  // Conditional update: only one process can move this row from failed -> processing
  const { data: claimed, error: claimError } = await supabaseAny
    .from('membership_renewals')
    .update({ status: 'processing', attempts: existing.attempts + 1, last_attempt_on: today, updated_at: new Date().toISOString() })
    .eq('renewal_id', existing.renewal_id)
    .eq('status', 'failed')
    .lt('last_attempt_on', today)
    .select('attempts');
  if (claimError) throw claimError;
  return claimed && claimed.length > 0 ? claimed[0]!.attempts : null;
}

async function finishRenewal(membershipId: number, periodEnd: string, fields: Record<string, unknown>) {
  const { error } = await supabaseAny
    .from('membership_renewals')
    .update({ ...fields, updated_at: new Date().toISOString() })
    .eq('membership_id', membershipId)
    .eq('period_end', periodEnd);
  if (error) logger.error({ err: error, membershipId, periodEnd }, 'Failed to record renewal outcome');
}

export type RenewalOutcome = 'renewed' | 'declined' | 'skipped';

/**
 * Charge one membership's stored card for its next term.
 */
export async function chargeMembershipRenewal(m: MembershipWithCustomer, today: string): Promise<RenewalOutcome> {
  if (!m.end_date || !m.square_card_id) return 'skipped';
  const periodEnd = m.end_date;

  // The member already bought the next term themselves (it's queued as a
  // pending membership that starts after this one) — charging would bill twice.
  if (await hasQueuedSuccessor(m)) {
    const { error } = await supabaseAny
      .from('membership_renewals')
      .insert({ membership_id: m.membership_id, period_end: periodEnd, status: 'skipped', attempts: 0, last_attempt_on: today, error_message: 'Next term already purchased (queued membership)' });
    if (error && error.code !== '23505') throw error;
    logger.info({ membershipId: m.membership_id }, 'Auto-renew skipped — next term already purchased');
    return 'skipped';
  }

  const attempt = await claimRenewalAttempt(m.membership_id, periodEnd, today);
  if (attempt === null) return 'skipped';

  const plan = await getPlanByTier(m.tier);
  if (!plan) {
    // e.g. the plan was deactivated: we can't price a renewal, so tell the member
    await finishRenewal(m.membership_id, periodEnd, { status: 'failed', attempts: MAX_RENEWAL_ATTEMPTS, error_message: `No active plan for tier ${m.tier}` });
    logger.error({ membershipId: m.membership_id, tier: m.tier }, 'Auto-renew skipped — plan not found');
    if (m.customers?.email) {
      await sendMembershipExpirationReminder({
        email: m.customers.email,
        customerName: m.customers.full_name?.split(' ')[0] ?? 'Member',
        tierName: m.tier,
        expirationDate: DateTime.fromISO(periodEnd, { zone: BUSINESS_TZ }).toLocaleString(DateTime.DATE_FULL),
        daysRemaining: 0,
        autoRenew: false,
        displayId: m.display_id ?? undefined,
      }).catch(err => logger.warn({ err, membershipId: m.membership_id }, 'Renewal failure email failed'));
    }
    return 'declined';
  }

  const months = Math.max(1, m.renewal_months ?? 1);
  const taxRate = await getTaxRate();
  const subtotalCents = Math.round(dollarsToCents(plan.monthly_price) * months);
  const taxCents = calculateTaxCents(subtotalCents, taxRate);
  const subtotal = centsToDollars(subtotalCents);
  const taxAmount = centsToDollars(taxCents);
  const total = centsToDollars(subtotalCents + taxCents);

  const periodEndDt = DateTime.fromISO(periodEnd, { zone: BUSINESS_TZ });
  const newEndDate = periodEndDt.plus({ months }).toISODate()!;
  const description = `Membership - ${plan.name} (Auto-Renew)`;
  const idempotencyKey = `renew_${m.membership_id}_${periodEnd}_${attempt}`;

  let order: { order_id: number };
  try {
    order = await OrderRepository.create({
      customer_id: m.customer_id,
      order_type: 'Membership',
      status: 'Pending',
      subtotal_usd: subtotal,
      discount_usd: 0,
      tax_usd: taxAmount,
      total_usd: total,
      notes: `${description} | ${periodEndDt.plus({ days: 1 }).toISODate()} to ${newEndDate}`,
    });
  } catch (error) {
    // Nothing was charged; release the claim so tomorrow's run can try again
    await finishRenewal(m.membership_id, periodEnd, { status: 'failed', error_message: `Order create failed: ${getSquareErrorDetail(error)}`.slice(0, 1000) });
    throw error;
  }

  let charged = false;
  try {
    const squareCustomerId = await ensureSquareCustomer(m.customer_id);
    const squareOrderId = await createItemizedSquareOrder({
      lines: [{ name: description, quantity: 1, unitPrice: subtotal, note: `${months} month${months === 1 ? '' : 's'}` }],
      taxRate,
      expectedTotal: total,
      referenceId: `order_${order.order_id}`,
      squareCustomerId,
      idempotencyKey: `${idempotencyKey}_order`,
    });

    const paymentRequest: CreatePaymentRequest = {
      sourceId: m.square_card_id,
      customerId: squareCustomerId,
      idempotencyKey,
      amountMoney: toSquareMoney(total),
      locationId: getSquareLocationId(),
      ...(squareOrderId ? { orderId: squareOrderId } : {}),
      referenceId: `order_${order.order_id}`,
      note: `${description} | Playfunia`,
      autocomplete: true,
    };
    const response = await withRetry(
      () => getSquareClient().payments.create(paymentRequest),
      { maxRetries: 3, operationName: 'squareRenewalPaymentCreate' }
    );
    const payment = response.payment;
    if (!payment?.id || !VALID_PAYMENT_STATUSES.includes(payment.status ?? '')) {
      throw new Error(`Payment not completed (status ${payment?.status ?? 'unknown'})`);
    }
    charged = true;

    // Record the charge first so a later failure can never lead to a second charge
    await finishRenewal(m.membership_id, periodEnd, {
      status: 'succeeded',
      amount_usd: total,
      new_end_date: newEndDate,
      order_id: order.order_id,
      square_payment_id: payment.id,
      square_order_id: squareOrderId,
      error_message: null,
    });
    await PaymentRepository.create({
      order_id: order.order_id,
      provider: 'square',
      provider_payment_id: payment.id,
      amount_usd: total,
      status: 'Captured',
      receipt_url: payment.receiptUrl ?? null,
    });
    await OrderRepository.update(order.order_id, { status: 'Completed' });
    await MembershipRepository.update(m.membership_id, {
      end_date: newEndDate,
      grace_period_end: null,
      visits_used_this_period: 0,
      visit_period_start: periodEndDt.plus({ days: 1 }).toISODate()!,
    });

    logger.info({ membershipId: m.membership_id, paymentId: payment.id, total, newEndDate }, 'Membership auto-renewed');

    if (m.customers?.email) {
      await sendMembershipConfirmation({
        email: m.customers.email,
        customerName: m.customers.full_name?.split(' ')[0] ?? 'Member',
        parentFullName: m.customers.full_name ?? undefined,
        tierName: plan.name,
        displayId: m.display_id ?? undefined,
        startDate: periodEndDt.plus({ days: 1 }).toLocaleString(DateTime.DATE_FULL),
        expiryDate: DateTime.fromISO(newEndDate, { zone: BUSINESS_TZ }).toLocaleString(DateTime.DATE_FULL),
        visitsPerMonth: plan.visits_per_month ?? null,
        guestPassesPerMonth: plan.guest_passes_per_month ?? null,
        discountPercent: plan.discount_percent ?? null,
        benefits: plan.benefits ?? null,
        autoRenew: true,
        monthlyPrice: plan.monthly_price,
        durationMonths: months,
        subtotal,
        taxAmount,
        taxRate: Number((taxRate * 100).toFixed(4)),
        total,
      }).catch(err => logger.warn({ err, membershipId: m.membership_id }, 'Renewal confirmation email failed'));
    }
    return 'renewed';
  } catch (error) {
    const detail = getSquareErrorDetail(error);
    if (charged) {
      // The card WAS charged; only our bookkeeping failed. Never mark this period
      // failed (that would allow a retry charge) — flag it for staff instead.
      await finishRenewal(m.membership_id, periodEnd, { status: 'succeeded', error_message: `Charged, but post-charge update failed: ${detail}`.slice(0, 1000) });
      logger.error({ err: error, membershipId: m.membership_id, newEndDate }, 'Auto-renew CHARGED but membership update failed — fix end_date manually');
      return 'renewed';
    }
    await OrderRepository.update(order.order_id, { status: 'Failed' }).catch(() => {});
    await finishRenewal(m.membership_id, periodEnd, { status: 'failed', order_id: order.order_id, error_message: detail.slice(0, 1000) });
    logger.warn({ membershipId: m.membership_id, attempt, detail }, 'Membership auto-renew charge failed');

    // Tell the member once, on the first failed attempt, so they can update their card or renew manually
    if (attempt === 1 && m.customers?.email) {
      await sendMembershipExpirationReminder({
        email: m.customers.email,
        customerName: m.customers.full_name?.split(' ')[0] ?? 'Member',
        tierName: plan.name,
        expirationDate: periodEndDt.toLocaleString(DateTime.DATE_FULL),
        daysRemaining: 0,
        autoRenew: true,
        paymentFailed: true,
        displayId: m.display_id ?? undefined,
      }).catch(err => logger.warn({ err, membershipId: m.membership_id }, 'Renewal failure email failed'));
    }
    return 'declined';
  }
}

/**
 * Charge every auto-renew membership whose term ends today, plus retries of
 * declines from the last two days. Called first by the daily renewal job.
 */
export async function processAutoRenewCharges(today: string): Promise<{ renewed: number; declined: number; errors: number }> {
  const result = { renewed: 0, declined: 0, errors: 0 };
  if (!appConfig.membershipAutochargeEnabled) return result;

  const earliest = DateTime.fromISO(today, { zone: BUSINESS_TZ }).minus({ days: MAX_RENEWAL_ATTEMPTS - 1 }).toISODate()!;
  const { data: due, error } = await supabaseAny
    .from('memberships')
    .select('*, customers(*)')
    .eq('status', 'active')
    .eq('auto_renew', true)
    .not('square_card_id', 'is', null)
    .gte('end_date', earliest)
    .lte('end_date', today);
  if (error) throw error;

  for (const m of (due ?? []) as MembershipWithCustomer[]) {
    try {
      const outcome = await chargeMembershipRenewal(m, today);
      if (outcome === 'renewed') result.renewed++;
      if (outcome === 'declined') result.declined++;
    } catch (err) {
      result.errors++;
      logger.error({ err, membershipId: m.membership_id }, 'Auto-renew processing failed');
    }
  }
  return result;
}
