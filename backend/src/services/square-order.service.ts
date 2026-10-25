/**
 * Square Orders API helper
 *
 * Builds an itemized Square Order so Square's dashboard and reports show what was
 * sold (e.g. "Membership - Mini Plan", "Mini Fun Party Package") instead of a
 * flat "Custom Amount". The returned orderId is attached to payments.create.
 *
 * Itemization must never block a sale: if Square's computed total differs from
 * ours (rounding) or the Orders API errors, we log and return null so the caller
 * falls back to a plain amount-only payment.
 */

import type { Square } from 'square';

import { getSquareClient, getSquareLocationId } from '../config/square';
import { dollarsToCents } from '../utils/currency';
import { logger } from '../utils/logger';
import { withRetry } from '../utils/retry';

export interface SquareOrderLine {
  name: string;
  quantity: number;
  /** Price of one unit in dollars */
  unitPrice: number;
  note?: string;
}

export interface SquareOrderInput {
  lines: SquareOrderLine[];
  /** Order-level discounts in dollars (coupons etc.) */
  discounts?: Array<{ name: string; amount: number }>;
  /** Tax rate as a fraction, e.g. 0.08 */
  taxRate?: number;
  /** Total we are about to charge, in dollars. The order must match it exactly. */
  expectedTotal: number;
  referenceId?: string;
  squareCustomerId?: string | null;
  idempotencyKey: string;
}

const SQUARE_NAME_MAX = 500;

function money(dollars: number): Square.Money {
  return { amount: BigInt(dollarsToCents(dollars)), currency: 'USD' };
}

function buildOrder(input: SquareOrderInput): Square.Order {
  const order: Square.Order = {
    locationId: getSquareLocationId(),
    referenceId: input.referenceId?.slice(0, 40),
    customerId: input.squareCustomerId ?? undefined,
    lineItems: input.lines.map(line => ({
      name: line.name.slice(0, SQUARE_NAME_MAX),
      quantity: String(line.quantity),
      basePriceMoney: money(line.unitPrice),
      note: line.note?.slice(0, 2000),
    })),
  };

  const discounts = (input.discounts ?? []).filter(d => d.amount > 0);
  if (discounts.length > 0) {
    order.discounts = discounts.map((d, i) => ({
      uid: `discount_${i}`,
      name: d.name.slice(0, 255),
      type: 'FIXED_AMOUNT',
      amountMoney: money(d.amount),
      scope: 'ORDER',
    }));
  }

  if (input.taxRate && input.taxRate > 0) {
    // Square expects a percentage string ("8" for 8%); trim float noise
    const percentage = String(Number((input.taxRate * 100).toFixed(4)));
    order.taxes = [{
      uid: 'sales_tax',
      name: 'Sales Tax',
      type: 'ADDITIVE',
      percentage,
      scope: 'ORDER',
    }];
  }

  return order;
}

/**
 * Create an itemized Square order whose total equals expectedTotal.
 * Returns the Square order ID, or null when the caller should charge without one.
 */
export async function createItemizedSquareOrder(input: SquareOrderInput): Promise<string | null> {
  if (input.lines.length === 0) return null;

  const expectedCents = BigInt(dollarsToCents(input.expectedTotal));
  const order = buildOrder(input);

  try {
    const square = getSquareClient();

    // Preview first so a rounding mismatch doesn't leave an orphaned OPEN order in Square
    const preview = await withRetry(
      () => square.orders.calculate({ order }),
      { maxRetries: 2, operationName: 'squareOrderCalculate' }
    );
    const previewTotal = preview.order?.totalMoney?.amount;
    if (previewTotal !== expectedCents) {
      logger.warn({
        referenceId: input.referenceId,
        expectedCents: expectedCents.toString(),
        squareCents: previewTotal?.toString(),
      }, 'Square order total mismatch — charging without itemized order');
      return null;
    }

    const created = await withRetry(
      () => square.orders.create({ order, idempotencyKey: input.idempotencyKey }),
      { maxRetries: 2, operationName: 'squareOrderCreate' }
    );
    const createdOrder = created.order;
    if (!createdOrder?.id || createdOrder.totalMoney?.amount !== expectedCents) {
      logger.warn({
        referenceId: input.referenceId,
        squareOrderId: createdOrder?.id,
        squareCents: createdOrder?.totalMoney?.amount?.toString(),
      }, 'Square order create returned unexpected total — charging without itemized order');
      return null;
    }

    return createdOrder.id;
  } catch (error) {
    logger.warn({ err: error, referenceId: input.referenceId }, 'Square order creation failed — charging without itemized order');
    return null;
  }
}

/** Human-readable Square line item name for a checkout item */
export function squareLineName(type: string, label: string): string {
  if (type === 'membership') return `Membership - ${label}`;
  if (type === 'booking') return /party/i.test(label) ? label : `${label} Party Package`;
  return label;
}
