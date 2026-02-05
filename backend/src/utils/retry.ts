/**
 * Retry Utility with Exponential Backoff (Fix #15)
 *
 * Implements Square's recommended retry pattern for transient errors:
 * - Rate limiting (429)
 * - Network timeouts
 * - Server errors (5xx)
 */

import { logger } from './logger';

/** Errors that are safe to retry */
const RETRYABLE_STATUS_CODES = [429, 500, 502, 503, 504];

/**
 * Check if an error is retryable
 */
export function isRetryableError(error: unknown): boolean {
  // Check for status code in Square API errors
  if (error && typeof error === 'object') {
    // Square SDK errors
    if ('statusCode' in error) {
      const code = (error as { statusCode: number }).statusCode;
      return RETRYABLE_STATUS_CODES.includes(code);
    }

    // HTTP-like errors
    if ('status' in error) {
      const code = (error as { status: number }).status;
      return RETRYABLE_STATUS_CODES.includes(code);
    }

    // Network errors
    if ('code' in error) {
      const code = (error as { code: string }).code;
      return ['ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'ENETDOWN', 'EPIPE'].includes(code);
    }
  }

  // Check error message for timeout/network issues
  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    return msg.includes('timeout') ||
           msg.includes('network') ||
           msg.includes('econnreset') ||
           msg.includes('socket hang up');
  }

  return false;
}

export interface RetryOptions {
  /** Maximum number of retry attempts (default: 3) */
  maxRetries?: number;
  /** Initial delay in milliseconds (default: 1000) */
  baseDelayMs?: number;
  /** Maximum delay in milliseconds (default: 10000) */
  maxDelayMs?: number;
  /** Operation name for logging */
  operationName?: string;
}

/**
 * Execute an operation with exponential backoff retry
 *
 * @example
 * const result = await withRetry(
 *   () => square.payments.create(paymentRequest),
 *   { maxRetries: 3, operationName: 'createPayment' }
 * );
 */
export async function withRetry<T>(
  operation: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const {
    maxRetries = 3,
    baseDelayMs = 1000,
    maxDelayMs = 10000,
    operationName = 'operation',
  } = options;

  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error as Error;

      // If not retryable, throw immediately
      if (!isRetryableError(error)) {
        throw error;
      }

      // If this was the last attempt, throw
      if (attempt === maxRetries) {
        logger.error({
          operationName,
          attempt: attempt + 1,
          maxRetries,
          error: lastError.message,
        }, 'Retry limit exceeded');
        throw error;
      }

      // Calculate delay with exponential backoff and jitter
      const exponentialDelay = baseDelayMs * Math.pow(2, attempt);
      const jitter = Math.random() * 0.3 * exponentialDelay; // 30% jitter
      const delay = Math.min(exponentialDelay + jitter, maxDelayMs);

      logger.warn({
        operationName,
        attempt: attempt + 1,
        maxRetries,
        delayMs: Math.round(delay),
        error: lastError.message,
      }, 'Retrying after transient error');

      // Wait before retry
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  // Should never reach here, but TypeScript needs this
  throw lastError ?? new Error('Retry failed');
}

/**
 * Wrap a function to automatically retry on transient errors
 *
 * @example
 * const createPaymentWithRetry = withRetryWrapper(
 *   (request) => square.payments.create(request),
 *   { operationName: 'createPayment' }
 * );
 */
export function withRetryWrapper<TArgs extends unknown[], TResult>(
  fn: (...args: TArgs) => Promise<TResult>,
  options: RetryOptions = {}
): (...args: TArgs) => Promise<TResult> {
  return (...args: TArgs) => withRetry(() => fn(...args), options);
}
