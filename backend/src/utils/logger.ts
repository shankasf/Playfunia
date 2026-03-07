import pino, { type LoggerOptions } from 'pino';

import { appConfig } from '../config/env';

const isDevelopment = appConfig.nodeEnv === 'development';

const transport = isDevelopment
  ? {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'SYS:standard',
      },
    }
  : undefined;

const loggerOptions: LoggerOptions = {
  level: isDevelopment ? 'debug' : 'info',
  ...(transport ? { transport } : {}),
  // Redact PII from logs to protect personal data
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'email',
      'guardian_email',
      'guardianEmail',
      'phone',
      'guardian_phone',
      'guardianPhone',
      'password',
      'password_hash',
      'dateOfBirth',
      'guardian_date_of_birth',
      'guardianDateOfBirth',
      'digital_signature',
      'signature',
      'ip_address',
    ],
    censor: '[REDACTED]',
  },
};

export const logger = pino(loggerOptions);

/**
 * Helper to extract database error details from Supabase/PostgreSQL errors
 */
export function extractDbErrorDetails(error: unknown): Record<string, unknown> {
  if (error && typeof error === 'object') {
    const dbError = error as {
      code?: string;
      details?: string;
      hint?: string;
      message?: string;
      stack?: string;
    };
    return {
      message: dbError.message,
      code: dbError.code,
      details: dbError.details,
      hint: dbError.hint,
      stack: dbError.stack,
    };
  }
  return { raw: String(error) };
}

/**
 * Log a database operation with timing and error details
 */
export async function logDbOperation<T>(
  operation: string,
  table: string,
  fn: () => Promise<T>,
): Promise<T> {
  const startTime = Date.now();
  try {
    const result = await fn();
    const duration = Date.now() - startTime;
    if (duration > 1000) {
      // Log slow queries (>1s)
      logger.warn({
        type: 'SLOW_DB_QUERY',
        operation,
        table,
        durationMs: duration,
      });
    }
    return result;
  } catch (error) {
    const duration = Date.now() - startTime;
    logger.error({
      type: 'DB_ERROR',
      operation,
      table,
      durationMs: duration,
      error: extractDbErrorDetails(error),
    });
    throw error;
  }
}
