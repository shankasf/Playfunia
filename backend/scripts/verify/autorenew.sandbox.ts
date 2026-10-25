/**
 * End-to-end verification of itemized Square orders + membership auto-renew
 * against the SQUARE SANDBOX, with the database replaced by an in-memory fake.
 *
 * Nothing here touches Supabase: repositories, supabase clients, email and SMS
 * are stubbed before the services load. Square calls are real (sandbox only;
 * the script aborts if SQUARE_ENVIRONMENT is anything else).
 *
 * Run from backend/ with sandbox credentials in the environment:
 *   MEMBERSHIP_AUTOCHARGE_ENABLED=true TZ=UTC npx tsx scripts/verify/autorenew.sandbox.ts
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import path from 'node:path';

import { DateTime } from 'luxon';

// ---------------------------------------------------------------------------
// In-memory database
// ---------------------------------------------------------------------------
type Row = Record<string, any>;
const db: Record<string, Row[]> = {
  customers: [], memberships: [], membership_renewals: [], membership_reminders: [], orders: [], payments: [],
};
const seq: Record<string, number> = {};
const pk: Record<string, string> = {
  customers: 'customer_id', memberships: 'membership_id', membership_renewals: 'renewal_id',
  membership_reminders: 'reminder_id', orders: 'order_id', payments: 'payment_id',
};
function nextId(table: string) { seq[table] = (seq[table] ?? 0) + 1; return seq[table]; }

function from(table: string) {
  const rows = db[table];
  if (!rows) throw new Error(`fake db: unknown table ${table}`);
  const filters: Array<(r: Row) => boolean> = [];
  let op: 'select' | 'insert' | 'update' = 'select';
  let payload: Row | null = null;
  let joinCustomers = false;
  let single = false;
  let returning = false;

  const exec = (): { data: any; error: any } => {
    if (op === 'insert') {
      const row = { ...payload };
      if (table === 'membership_renewals' && rows.some(r => r.membership_id === row.membership_id && r.period_end === row.period_end)) {
        return { data: null, error: { code: '23505', message: 'duplicate key' } };
      }
      row[pk[table]!] = nextId(table);
      rows.push(row);
      return { data: single ? row : [row], error: null };
    }
    const matched = rows.filter(r => filters.every(f => f(r)));
    if (op === 'update') {
      matched.forEach(r => Object.assign(r, payload));
      return { data: returning ? matched.map(r => ({ ...r })) : null, error: null };
    }
    const out = matched.map(r => (joinCustomers ? { ...r, customers: db.customers!.find(c => c.customer_id === r.customer_id) ?? null } : { ...r }));
    if (single) return out.length ? { data: out[0], error: null } : { data: null, error: { code: 'PGRST116' } };
    return { data: out, error: null };
  };

  const b: any = {
    insert(v: Row) { op = 'insert'; payload = v; return b; },
    update(v: Row) { op = 'update'; payload = v; return b; },
    select(cols?: string) { if (op === 'select') joinCustomers = Boolean(cols?.includes('customers(')); else returning = true; return b; },
    eq(c: string, v: any) { filters.push(r => r[c] === v); return b; },
    lt(c: string, v: any) { filters.push(r => r[c] != null && r[c] < v); return b; },
    lte(c: string, v: any) { filters.push(r => r[c] != null && r[c] <= v); return b; },
    gte(c: string, v: any) { filters.push(r => r[c] != null && r[c] >= v); return b; },
    is(c: string, v: any) { filters.push(r => (r[c] ?? null) === v); return b; },
    not(c: string, operator: string, v: any) { assert.equal(operator, 'is'); filters.push(r => (r[c] ?? null) !== v); return b; },
    order() { return b; },
    limit() { return b; },
    single() { single = true; return b; },
    maybeSingle() { single = true; return b; },
    then(res: any, rej: any) { try { return Promise.resolve(exec()).then(res, rej); } catch (e) { return Promise.reject(e).then(res, rej); } },
  };
  return b;
}
const fakeSupabase = { from };

const plans = [{ plan_id: 12, name: 'Mini Plan', monthly_price: 250, visits_per_month: null, max_children: 1, max_adults: 1, guest_passes_per_month: 0, discount_percent: 0, benefits: [], is_active: true }];

function strictStub(name: string, impl: Record<string, (...a: any[]) => any>) {
  return new Proxy(impl, {
    get(target, prop: string) {
      if (prop in target) return target[prop];
      if (prop === '__esModule' || prop === 'then') return undefined;
      return () => { throw new Error(`Unexpected call ${name}.${prop} — test would have hit the real database`); };
    },
  });
}

const repositories = {
  CustomerRepository: strictStub('CustomerRepository', {
    findById: async (id: number) => db.customers!.find(c => c.customer_id === id) ?? null,
    update: async (id: number, u: Row) => Object.assign(db.customers!.find(c => c.customer_id === id)!, u),
  }),
  MembershipRepository: strictStub('MembershipRepository', {
    findById: async (id: number) => ({ ...db.memberships!.find(m => m.membership_id === id) }),
    update: async (id: number, u: Row) => Object.assign(db.memberships!.find(m => m.membership_id === id)!, u),
    findExpiringBetween: async (s: string, e: string) => (await from('memberships').select('*, customers(*)').eq('status', 'active').gte('end_date', s).lte('end_date', e)).data,
    findPastGracePeriod: async (today: string) => (await from('memberships').select('*, customers(*)').eq('status', 'active').lt('grace_period_end', today)).data,
  }),
  MembershipPlanRepository: strictStub('MembershipPlanRepository', { findAll: async () => plans }),
  OrderRepository: strictStub('OrderRepository', {
    create: async (o: Row) => (await from('orders').insert(o).select().single()).data,
    update: async (id: number, u: Row) => Object.assign(db.orders!.find(o => o.order_id === id)!, u),
  }),
  PaymentRepository: strictStub('PaymentRepository', {
    create: async (p: Row) => (await from('payments').insert(p).select().single()).data,
  }),
};

const emails: Array<{ fn: string; data: any }> = [];
const emailStub = strictStub('email.service', {
  sendMembershipConfirmation: async (d: any) => { emails.push({ fn: 'confirmation', data: d }); return true; },
  sendMembershipExpirationReminder: async (d: any) => { emails.push({ fn: 'reminder', data: d }); return true; },
  sendMembershipExpiredNotice: async (d: any) => { emails.push({ fn: 'expired', data: d }); return true; },
});

// ---------------------------------------------------------------------------
// Install stubs before any service module loads
// ---------------------------------------------------------------------------
const src = path.resolve(__dirname, '../../src');
function stub(rel: string, exports: any) {
  const file = require.resolve(path.join(src, rel));
  require.cache[file] = { id: file, filename: file, loaded: true, exports } as any;
}
stub('repositories/index', repositories);
stub('config/supabase', { supabase: fakeSupabase, supabaseAny: fakeSupabase });
stub('services/email.service', emailStub);
stub('services/sms.service', { sendMembershipExpiryReminderSms: async () => ({ success: false }) });
stub('services/pricing-config.service', strictStub('pricing-config', { getTaxRate: async () => 0.08, getTaxRateSync: () => 0.08 }));
stub('services/membership.service', strictStub('membership.service', {
  getPlanByTier: async (tier: string) => (tier === 'mini' ? plans[0] : null),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { appConfig } = require(path.join(src, 'config/env'));
if (appConfig.squareEnvironment !== 'sandbox') {
  throw new Error(`Refusing to run: SQUARE_ENVIRONMENT=${appConfig.squareEnvironment} (must be sandbox)`);
}
if (!String(appConfig.supabaseUrl ?? process.env.SUPABASE_URL ?? '').startsWith('http://127.0.0.1')) {
  throw new Error('Refusing to run: SUPABASE_URL must point at a dead local address');
}
/* eslint-disable @typescript-eslint/no-require-imports */
const { getSquareClient, getSquareLocationId } = require(path.join(src, 'config/square'));
const { createItemizedSquareOrder, squareLineName } = require(path.join(src, 'services/square-order.service'));
const billing = require(path.join(src, 'services/membership-billing.service'));
const { processMembershipRenewals } = require(path.join(src, 'services/membership-renewal.service'));
/* eslint-enable @typescript-eslint/no-require-imports */

const square = getSquareClient();
const cents = (d: number) => BigInt(Math.round(d * 100));
const todayET = DateTime.now().setZone('America/New_York').toISODate()!;
const tomorrowET = DateTime.fromISO(todayET, { zone: 'America/New_York' }).plus({ days: 1 }).toISODate()!;

const results: Array<[string, boolean, string?]> = [];
async function test(name: string, fn: () => Promise<void>) {
  try { await fn(); results.push([name, true]); console.log(`PASS  ${name}`); }
  catch (e) { results.push([name, false, (e as Error).message]); console.log(`FAIL  ${name}\n      ${(e as Error).stack}`); }
}

async function payWithNonce(amount: number, orderId?: string, nonce = 'cnon:card-nonce-ok') {
  const r = await square.payments.create({
    sourceId: nonce, idempotencyKey: randomUUID(), amountMoney: { amount: cents(amount), currency: 'USD' },
    locationId: getSquareLocationId(), autocomplete: true, ...(orderId ? { orderId } : {}),
  });
  return r.payment!;
}

// Unique ids per run: Square remembers idempotency keys (renew_<membershipId>_<date>_<n>) across runs
const RUN = Date.now() % 1_000_000 * 10;
const M = (n: number) => RUN + n;

function seedMember(id: number, endDate: string) {
  db.customers!.push({ customer_id: id, full_name: `Sandbox Tester${id}`, email: `sandbox+${id}@example.com`, square_customer_id: null });
  db.memberships!.push({
    membership_id: id, customer_id: id, tier: 'mini', status: 'active', start_date: '2026-09-25', end_date: endDate,
    auto_renew: true, renewal_months: 1, square_card_id: null, grace_period_end: null, visits_used_this_period: 4, display_id: `PF-M${id}`,
  });
}

(async () => {
  // Cart: 2 tickets @ $19.99, Mini membership $250, party $349.50, 10% coupon worth $61.95
  const cart = [
    { type: 'ticket', label: 'General Admission Ticket', quantity: 2, unitPrice: 19.99 },
    { type: 'membership', label: 'Mini Plan', quantity: 1, unitPrice: 250 },
    { type: 'booking', label: 'Mini Fun Party Package', quantity: 1, unitPrice: 349.5 },
  ];
  const subtotal = cart.reduce((s, l) => s + Math.round(l.unitPrice * 100) * l.quantity, 0) / 100;
  const coupon = 61.95;
  const discounted = Math.round((subtotal - coupon) * 100) / 100;
  const total = Math.round((discounted + Math.round(discounted * 0.08 * 100) / 100) * 100) / 100;

  let checkoutPaymentId = '';
  await test('checkout: itemized order total matches ours and payment links to it', async () => {
    const orderId = await createItemizedSquareOrder({
      lines: cart.map(l => ({ name: squareLineName(l.type, l.label), quantity: l.quantity, unitPrice: l.unitPrice })),
      discounts: [{ name: 'SAVE10', amount: coupon }], taxRate: 0.08, expectedTotal: total,
      referenceId: 'order_test', idempotencyKey: randomUUID(),
    });
    assert.ok(orderId, 'expected an order id (totals should match)');
    const payment = await payWithNonce(total, orderId);
    assert.equal(payment.status, 'COMPLETED');
    assert.equal(payment.orderId, orderId);
    checkoutPaymentId = payment.id!;
    const { order } = await square.orders.get({ orderId });
    const names = order!.lineItems!.map((li: any) => li.name);
    assert.deepEqual(names, ['General Admission Ticket', 'Membership - Mini Plan', 'Mini Fun Party Package']);
    assert.equal(order!.state, 'COMPLETED');
    assert.equal(order!.totalMoney!.amount, cents(total));
  });

  await test('checkout: total mismatch falls back to no order (sale not blocked)', async () => {
    const orderId = await createItemizedSquareOrder({
      lines: [{ name: 'General Admission Ticket', quantity: 1, unitPrice: 19.99 }], taxRate: 0.08,
      expectedTotal: 21.6, referenceId: 'order_mismatch', idempotencyKey: randomUUID(),
    });
    assert.equal(orderId, null);
  });

  await test('party deposit: single untaxed line item order matches amount', async () => {
    const orderId = await createItemizedSquareOrder({
      lines: [{ name: 'Mini Fun Party Package - Deposit', quantity: 1, unitPrice: 100, note: 'Ref: BK-TEST' }],
      expectedTotal: 100, referenceId: 'booking_test', idempotencyKey: randomUUID(),
    });
    assert.ok(orderId);
    const payment = await payWithNonce(100, orderId);
    assert.equal(payment.orderId, orderId);
  });

  await test('refund: order-linked payment refunds normally', async () => {
    const r = await square.refunds.refundPayment({
      idempotencyKey: randomUUID(), paymentId: checkoutPaymentId, amountMoney: { amount: 1999n, currency: 'USD' }, reason: 'sandbox test',
    });
    assert.ok(['PENDING', 'COMPLETED'].includes(r.refund!.status!), r.refund!.status);
  });

  // --- Auto-renew -----------------------------------------------------------
  seedMember(M(1), todayET);
  await test('purchase: card from completed payment is stored on file', async () => {
    const payment = await payWithNonce(270);
    const cardId = await billing.storeCardForAutoRenew({ paymentId: payment.id, membershipIds: [M(1)] });
    assert.ok(cardId, 'card should be stored');
    assert.equal(db.memberships![0]!.square_card_id, cardId);
    assert.ok(db.customers![0]!.square_customer_id, 'Square customer should be created');
    const { card } = await square.cards.get({ cardId });
    assert.equal(card!.customerId, db.customers![0]!.square_customer_id);
    assert.equal(card!.enabled, true);
  });

  await test('renewal job: charges card on end date, extends membership, itemizes', async () => {
    emails.length = 0;
    const r = await processMembershipRenewals();
    assert.equal(r.renewed, 1, JSON.stringify(r));
    const m = db.memberships![0]!;
    const expectedEnd = DateTime.fromISO(todayET, { zone: 'America/New_York' }).plus({ months: 1 }).toISODate();
    assert.equal(m.end_date, expectedEnd);
    assert.equal(m.visits_used_this_period, 0);
    assert.equal(m.grace_period_end, null);
    const renewal = db.membership_renewals!.find(x => x.membership_id === M(1))!;
    assert.equal(renewal.status, 'succeeded');
    assert.equal(renewal.amount_usd, 270);
    const { payment } = await square.payments.get({ paymentId: renewal.square_payment_id });
    assert.equal(payment!.amountMoney!.amount, 27000n);
    assert.equal(payment!.status, 'COMPLETED');
    assert.ok(payment!.orderId, 'renewal payment should carry an itemized order');
    const { order } = await square.orders.get({ orderId: payment!.orderId! });
    assert.equal(order!.lineItems![0]!.name, 'Membership - Mini Plan (Auto-Renew)');
    assert.equal(db.orders!.find(o => o.order_id === renewal.order_id)!.status, 'Completed');
    assert.equal(db.payments!.length, 1);
    assert.ok(emails.some(e => e.fn === 'confirmation'), 'renewal confirmation email');
    assert.ok(!emails.some(e => e.fn === 'reminder' && e.data.daysRemaining === 0), 'no "expires today" email after renewing');
  });

  await test('idempotency: re-running the job the same day never charges twice', async () => {
    db.memberships![0]!.end_date = todayET; // pretend the extension write was lost
    const r = await processMembershipRenewals();
    assert.equal(r.renewed, 0);
    assert.equal(db.membership_renewals!.filter(x => x.membership_id === M(1)).length, 1);
    assert.equal(db.payments!.length, 1);
  });

  seedMember(M(2), todayET);
  await test('idempotency: two processes racing on one period charge once', async () => {
    const payment = await payWithNonce(270);
    await billing.storeCardForAutoRenew({ paymentId: payment.id, membershipIds: [M(2)] });
    const m = { ...db.memberships!.find(x => x.membership_id === M(2))!, customers: db.customers!.find(c => c.customer_id === M(2)) };
    const outcomes = await Promise.all([billing.chargeMembershipRenewal(m, todayET), billing.chargeMembershipRenewal(m, todayET)]);
    assert.deepEqual(outcomes.sort(), ['renewed', 'skipped']);
    assert.equal(db.payments!.filter(p => db.orders!.find(o => o.order_id === p.order_id)?.customer_id === M(2)).length, 1);
  });

  seedMember(M(3), todayET);
  await test('decline: failed charge is recorded, member emailed once, not extended', async () => {
    const payment = await payWithNonce(270);
    const cardId = await billing.storeCardForAutoRenew({ paymentId: payment.id, membershipIds: [M(3)] });
    await square.cards.disable({ cardId }); // make the stored card unusable
    emails.length = 0;
    const m = () => ({ ...db.memberships!.find(x => x.membership_id === M(3))!, customers: db.customers!.find(c => c.customer_id === M(3)) });
    assert.equal(await billing.chargeMembershipRenewal(m(), todayET), 'declined');
    const renewal = db.membership_renewals!.find(x => x.membership_id === M(3))!;
    assert.equal(renewal.status, 'failed');
    assert.equal(renewal.attempts, 1);
    assert.ok(renewal.error_message);
    assert.equal(db.memberships!.find(x => x.membership_id === M(3))!.end_date, todayET);
    assert.equal(db.orders!.find(o => o.order_id === renewal.order_id)!.status, 'Failed');
    assert.equal(emails.filter(e => e.data.paymentFailed).length, 1);

    // Same day: no retry
    assert.equal(await billing.chargeMembershipRenewal(m(), todayET), 'skipped');
    // Next day: retried as attempt 2, no second email
    assert.equal(await billing.chargeMembershipRenewal(m(), tomorrowET), 'declined');
    assert.equal(db.membership_renewals!.find(x => x.membership_id === M(3))!.attempts, 2);
    assert.equal(emails.filter(e => e.data.paymentFailed).length, 1);
  });

  await test('decline: renewal job does not send a duplicate expires-today email', async () => {
    emails.length = 0;
    await processMembershipRenewals();
    const sentTo3 = emails.filter(e => e.data.email === `sandbox+${M(3)}@example.com` && e.data.daysRemaining === 0);
    assert.equal(sentTo3.length, 0, JSON.stringify(sentTo3));
    assert.ok(db.memberships!.find(x => x.membership_id === M(3))!.grace_period_end, 'grace period set so member can still check in');
  });

  seedMember(M(6), todayET);
  await test('queued next term (bought before end date): renewal does not charge', async () => {
    const payment = await payWithNonce(270);
    await billing.storeCardForAutoRenew({ paymentId: payment.id, membershipIds: [M(6)] });
    db.memberships!.push({ membership_id: M(6) + 100_000, customer_id: M(6), tier: 'mini', status: 'pending', start_date: tomorrowET, end_date: null, auto_renew: true });
    const paymentsBefore = db.payments!.length;
    const m = { ...db.memberships!.find(x => x.membership_id === M(6))!, customers: db.customers!.find(c => c.customer_id === M(6)) };
    assert.equal(await billing.chargeMembershipRenewal(m, todayET), 'skipped');
    assert.equal(db.payments!.length, paymentsBefore);
    assert.equal(db.membership_renewals!.find(x => x.membership_id === M(6))!.status, 'skipped');
    assert.equal(db.orders!.filter(o => o.customer_id === M(6)).length, 0, 'no order created');
  });

  await test('declined, then member renews online: retry does not charge', async () => {
    // Member 3 was declined today; they buy the next term manually (queued)
    db.memberships!.push({ membership_id: M(3) + 100_000, customer_id: M(3), tier: 'mini', status: 'pending', start_date: tomorrowET, end_date: null, auto_renew: true });
    const m = { ...db.memberships!.find(x => x.membership_id === M(3))!, customers: db.customers!.find(c => c.customer_id === M(3)) };
    const attemptsBefore = db.membership_renewals!.find(x => x.membership_id === M(3))!.attempts;
    const dayAfter = DateTime.fromISO(tomorrowET, { zone: 'America/New_York' }).plus({ days: 1 }).toISODate()!;
    assert.equal(await billing.chargeMembershipRenewal(m, dayAfter), 'skipped');
    assert.equal(db.membership_renewals!.find(x => x.membership_id === M(3))!.attempts, attemptsBefore, 'no new attempt');
  });

  seedMember(M(4), todayET);
  await test('no card on file: auto-renew membership is not charged', async () => {
    const r = await billing.processAutoRenewCharges(todayET);
    assert.equal(r.renewed + r.declined, 0);
    assert.equal(db.membership_renewals!.filter(x => x.membership_id === M(4)).length, 0);
  });

  await test('feature flag off: nothing is charged', async () => {
    seedMember(M(5), todayET);
    db.memberships!.find(x => x.membership_id === M(5))!.square_card_id = db.memberships!.find(x => x.membership_id === M(2))!.square_card_id;
    appConfig.membershipAutochargeEnabled = false;
    try {
      const r = await billing.processAutoRenewCharges(todayET);
      assert.deepEqual(r, { renewed: 0, declined: 0, errors: 0 });
    } finally { appConfig.membershipAutochargeEnabled = true; }
  });

  await test('turning auto-renew off disables the stored card in Square', async () => {
    const cardId = db.memberships!.find(x => x.membership_id === M(1))!.square_card_id;
    await billing.disableStoredCard(cardId);
    const { card } = await square.cards.get({ cardId });
    assert.equal(card!.enabled, false);
  });

  const failed = results.filter(r => !r[1]);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  process.exit(failed.length ? 1 : 0);
})();
