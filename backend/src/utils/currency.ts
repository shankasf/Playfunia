/**
 * Currency Utility Module
 *
 * Provides precise currency arithmetic to avoid JavaScript floating-point errors.
 * All calculations are done in cents (integers) to ensure exact values.
 *
 * Problem: JavaScript floating point causes issues like:
 * - `19.99 * 3 = 59.97000000000001`
 * - `1.005 * 100 = 100.49999999999999` (rounds to 100, not 101)
 *
 * Solution: Work in cents internally, convert to dollars only for display.
 */

/**
 * Convert dollars to cents (integer).
 * Uses string manipulation to avoid floating point precision issues.
 *
 * @example dollarsToCents(19.99) => 1999
 * @example dollarsToCents(0.50) => 50
 */
export function dollarsToCents(dollars: number): number {
  // Handle edge cases
  if (!Number.isFinite(dollars)) {
    return 0;
  }

  // Use toFixed(2) to get a consistent string representation,
  // then parse the parts to avoid floating point issues
  const str = dollars.toFixed(2);
  const parts = str.split('.');
  const whole = parts[0] ?? '0';
  const frac = parts[1] ?? '0';
  const wholeCents = parseInt(whole, 10) * 100;
  const fracCents = parseInt(frac, 10);

  // Handle negative numbers
  if (dollars < 0) {
    return wholeCents - fracCents;
  }
  return wholeCents + fracCents;
}

/**
 * Convert cents to dollars.
 *
 * @example centsToDollars(1999) => 19.99
 * @example centsToDollars(50) => 0.50
 */
export function centsToDollars(cents: number): number {
  return cents / 100;
}

/**
 * Add dollar amounts precisely (via cents).
 * Avoids floating point errors when summing monetary values.
 *
 * @example addDollars(19.99, 5.01) => 25.00
 * @example addDollars(0.1, 0.2) => 0.30 (not 0.30000000000000004)
 */
export function addDollars(...amounts: number[]): number {
  const totalCents = amounts.reduce((sum, amt) => sum + dollarsToCents(amt), 0);
  return centsToDollars(totalCents);
}

/**
 * Subtract dollar amounts precisely (via cents).
 *
 * @example subtractDollars(25.00, 5.01) => 19.99
 */
export function subtractDollars(minuend: number, subtrahend: number): number {
  const resultCents = dollarsToCents(minuend) - dollarsToCents(subtrahend);
  return centsToDollars(resultCents);
}

/**
 * Multiply a dollar amount by a quantity precisely.
 *
 * @example multiplyDollars(19.99, 3) => 59.97
 */
export function multiplyDollars(amount: number, multiplier: number): number {
  const cents = dollarsToCents(amount);
  return centsToDollars(cents * multiplier);
}

/**
 * Calculate tax on an amount in cents.
 * Rounds to nearest cent (standard accounting practice).
 *
 * @param amountCents - The amount in cents to calculate tax on
 * @param taxRate - Tax rate as a decimal (e.g., 0.08 for 8%)
 * @returns Tax amount in cents (integer)
 *
 * @example calculateTaxCents(1999, 0.08) => 160 (1999 * 0.08 = 159.92, rounds to 160)
 */
export function calculateTaxCents(amountCents: number, taxRate: number): number {
  return Math.round(amountCents * taxRate);
}

/**
 * Calculate tax on a dollar amount, returning tax in dollars.
 * Uses cents internally for precise calculation.
 *
 * @param amountDollars - The amount in dollars
 * @param taxRate - Tax rate as a decimal (e.g., 0.08 for 8%)
 * @returns Tax amount in dollars
 *
 * @example calculateTax(19.99, 0.08) => 1.60
 */
export function calculateTax(amountDollars: number, taxRate: number): number {
  const amountCents = dollarsToCents(amountDollars);
  const taxCents = calculateTaxCents(amountCents, taxRate);
  return centsToDollars(taxCents);
}

/**
 * Round a dollar amount to 2 decimal places.
 * This is a safer alternative to the common `Math.round(x * 100) / 100` pattern.
 *
 * @example roundCurrency(19.994) => 19.99
 * @example roundCurrency(19.995) => 20.00
 */
export function roundCurrency(dollars: number): number {
  return centsToDollars(dollarsToCents(dollars));
}

/**
 * Convert dollars to Square Money format (BigInt cents).
 * Square API expects amounts in the smallest currency unit.
 *
 * @example toSquareMoney(19.99) => { amount: 1999n, currency: 'USD' }
 */
export function toSquareMoney(dollars: number): { amount: bigint; currency: 'USD' } {
  return {
    amount: BigInt(dollarsToCents(dollars)),
    currency: 'USD',
  };
}

/**
 * Payment amount limits for Square.
 */
export const PAYMENT_LIMITS = {
  /** Minimum payment amount in dollars (Square requirement) */
  MIN_USD: 0.50,
  /** Maximum payment amount in dollars (business rule) */
  MAX_USD: 50000,
};

/**
 * Validate that a payment amount is within acceptable limits.
 * @throws Error if amount is outside limits
 */
export function validatePaymentAmount(amountDollars: number): void {
  if (amountDollars < PAYMENT_LIMITS.MIN_USD) {
    throw new Error(`Minimum payment amount is $${PAYMENT_LIMITS.MIN_USD.toFixed(2)}`);
  }
  if (amountDollars > PAYMENT_LIMITS.MAX_USD) {
    throw new Error(`Maximum payment amount is $${PAYMENT_LIMITS.MAX_USD.toFixed(2)}`);
  }
}
