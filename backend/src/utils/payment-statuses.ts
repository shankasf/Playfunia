/**
 * Canonical payment status values for party bookings.
 * All services MUST use these constants instead of string literals
 * to prevent inconsistencies and typos.
 */
export const PAYMENT_STATUS = {
  /** Initial status when booking is created (deposit required) */
  AWAITING_DEPOSIT: 'awaiting_deposit',
  /** Initial status for full-payment guest bookings */
  AWAITING_FULL_PAYMENT: 'awaiting_full_payment',
  /** Deposit has been successfully paid */
  DEPOSIT_PAID: 'deposit_paid',
  /** Full payment completed */
  PAID: 'paid',
  /** Payment failed */
  FAILED: 'failed',
  /** Generic pending state (used by webhooks) */
  PENDING: 'pending',
} as const;

export type PaymentStatus = typeof PAYMENT_STATUS[keyof typeof PAYMENT_STATUS];
