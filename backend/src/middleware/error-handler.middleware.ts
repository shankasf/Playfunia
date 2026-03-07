import type { NextFunction, Request, Response } from 'express';

import { isAppError } from '../utils/app-error';
import { logger } from '../utils/logger';

interface DatabaseError {
  code?: string;
  details?: string;
  hint?: string;
  message?: string;
}

interface ErrorContext {
  method: string;
  path: string;
  query: Record<string, unknown>;
  userId?: string;
  ip?: string;
  userAgent?: string;
}

function extractErrorDetails(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    const dbError = error as Error & DatabaseError & { cause?: unknown };
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
      // Database error details (Supabase/PostgreSQL)
      code: dbError.code,
      details: dbError.details,
      hint: dbError.hint,
      // Nested cause if available
      cause: dbError.cause ? extractErrorDetails(dbError.cause) : undefined,
    };
  }

  // Handle non-Error objects (e.g. Square SDK throws plain objects with statusCode, errors, body)
  if (error && typeof error === 'object') {
    const obj = error as Record<string, unknown>;
    const details: Record<string, unknown> = {};

    // Extract known Square SDK error properties
    if ('statusCode' in obj) details.statusCode = obj.statusCode;
    if ('errors' in obj) details.errors = obj.errors;
    if ('body' in obj) details.body = typeof obj.body === 'string' ? obj.body.slice(0, 500) : obj.body;
    if ('message' in obj) details.message = obj.message;
    if ('name' in obj) details.name = obj.name;

    // If we got any known properties, return them
    if (Object.keys(details).length > 0) {
      return details;
    }

    // Fallback: try JSON.stringify for unknown objects
    try {
      return { raw: JSON.stringify(obj).slice(0, 1000) };
    } catch {
      return { raw: '[Unserializable object]', keys: Object.keys(obj) };
    }
  }

  return { raw: String(error) };
}

function getRequestContext(req: Request): ErrorContext {
  return {
    method: req.method,
    path: req.originalUrl,
    query: req.query as Record<string, unknown>,
    userId: (req as Request & { user?: { id?: string } }).user?.id,
    ip: req.ip || req.socket.remoteAddress,
    userAgent: req.get('user-agent'),
  };
}

export function errorHandlerMiddleware(
  error: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
) {
  const context = getRequestContext(req);
  const errorDetails = extractErrorDetails(error);
  const timestamp = new Date().toISOString();

  if (isAppError(error)) {
    if (error.statusCode >= 500) {
      logger.error({
        type: 'APP_ERROR',
        timestamp,
        statusCode: error.statusCode,
        ...context,
        error: errorDetails,
      });
    } else {
      // Log 4xx errors at info level for debugging without cluttering error logs
      logger.info({
        type: 'CLIENT_ERROR',
        timestamp,
        statusCode: error.statusCode,
        ...context,
        message: error.message,
      });
    }
    return res.status(error.statusCode).json({ message: error.message });
  }

  // Unhandled/unexpected errors - always log with full details
  logger.error({
    type: 'UNHANDLED_ERROR',
    timestamp,
    ...context,
    error: errorDetails,
  });

  // Also log to console for immediate visibility in pm2 logs
  console.error(`[${timestamp}] UNHANDLED_ERROR | ${context.method} ${context.path}`, {
    error: errorDetails,
    context,
  });

  return res.status(500).json({ message: 'Internal Server Error' });
}
