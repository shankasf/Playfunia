import { Router, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';

import { supabaseAny } from '../config/supabase';
import { optionalAuthGuard } from '../middleware/auth.middleware';
import { logger } from '../utils/logger';

export const clientLogRouter = Router();

// Client errors arrive unauthenticated and from the public internet, so this is
// a spam target. Generous enough for a genuinely broken page (which can emit a
// burst), tight enough that it can't be used to flood the table.
const clientLogLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  // Dropping a telemetry event is never worth surfacing to a customer.
  message: { success: true, dropped: true },
});

const clientLogSchema = z.object({
  severity: z.enum(['error', 'warn', 'info']).default('error'),
  source: z.string().trim().min(1).max(64),
  message: z.string().trim().min(1).max(2000),
  errorName: z.string().trim().max(200).optional(),
  stack: z.string().max(8000).optional(),
  componentStack: z.string().max(8000).optional(),
  path: z.string().max(500).optional(),
  appVersion: z.string().max(64).optional(),
  sessionId: z.string().max(128).optional(),
  context: z.record(z.string(), z.unknown()).optional(),
  occurredAt: z.string().datetime().optional(),
});

/**
 * POST /api/client-logs
 *
 * Records an error that happened in the browser. This is the only visibility we
 * have into failures that never reach the server — an expired checkout timer, a
 * payment SDK that fails to load, a component crash. Without it, a customer
 * saying "it keeps giving me an error" leaves zero forensic trail.
 *
 * Always responds 202 (even on bad input): telemetry must never surface an
 * error of its own to a customer who is already having a bad time.
 */
clientLogRouter.post(
  '/',
  clientLogLimiter,
  optionalAuthGuard,
  async (req: Request, res: Response) => {
    // Acknowledge immediately — the browser should never wait on telemetry, and
    // should never see it fail.
    res.status(202).json({ success: true });

    try {
      const data = clientLogSchema.parse(req.body);
      const userId = (req as any).user?.userId ?? null;

      const row = {
        severity: data.severity,
        source: data.source,
        message: data.message,
        error_name: data.errorName ?? null,
        stack: data.stack ?? null,
        component_stack: data.componentStack ?? null,
        path: data.path ?? null,
        app_version: data.appVersion ?? null,
        user_id: userId,
        session_id: data.sessionId ?? null,
        context: data.context ?? null,
        user_agent: req.headers['user-agent'] ?? null,
        ip_address:
          (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ??
          req.ip ??
          null,
        occurred_at: data.occurredAt ?? null,
      };

      const { error } = await supabaseAny.from('client_error_logs').insert(row);

      if (error) {
        logger.error({ err: error.message, source: data.source }, 'Failed to persist client error log');
        return;
      }

      // Mirror into the app log so it shows up in `docker logs` alongside the
      // request that (didn't) follow it.
      logger.warn(
        {
          type: 'CLIENT_LOG',
          severity: data.severity,
          source: data.source,
          message: data.message,
          path: data.path,
          userId,
          context: data.context,
        },
        'Client-side error reported'
      );
    } catch (error) {
      if (error instanceof z.ZodError) {
        logger.debug({ issues: error.issues }, 'Rejected malformed client log');
      } else {
        logger.error({ err: error }, 'Unexpected error handling client log');
      }
    }
  }
);
