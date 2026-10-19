import compression from 'compression';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import pinoHttp from 'pino-http';

import { appConfig } from './config/env';
import { errorHandlerMiddleware } from './middleware/error-handler.middleware';
import { apiRouter } from './routes';
import { rejectInvalidEmailsInBody } from './middleware/email-validation.middleware';
import { logger } from './utils/logger';

export function createApp() {
  const app = express();

  // Caddy reaches the backend over the Docker bridge (a private address) and sets
  // X-Forwarded-For to the real client. Trust only private/loopback hops so req.ip
  // (and every rate limiter) sees the customer's IP, while a client connecting
  // directly from a public address can't spoof it with its own header.
  app.set('trust proxy', 'loopback, linklocal, uniquelocal');

  // Security headers — removes X-Powered-By, adds HSTS, CSP, etc.
  app.use(helmet({
    contentSecurityPolicy: false, // Caddy/frontend handles CSP
    hsts: { maxAge: 63072000, includeSubDomains: true, preload: true },
  }));

  // Enable gzip compression for all responses except SSE streams
  app.use(compression({
    filter: (req, res) => {
      if (res.getHeader('Content-Type') === 'text/event-stream') {
        return false;
      }
      return compression.filter(req, res);
    },
  }));

  app.use(pinoHttp({ logger }));

  app.use(
    cors({
      origin: appConfig.corsOrigin?.split(',').map(origin => origin.trim()) ?? ['http://localhost:3000'],
      credentials: true,
    }),
  );
  // Parse JSON for all routes EXCEPT webhooks (webhooks need raw body for signature verification)
  app.use((req, res, next) => {
    if (req.path.startsWith('/api/webhooks')) {
      return next();
    }
    // Waivers carry one signature image per adult, so allow a larger body there
    const limit = req.path === '/api/waivers' ? '10mb' : '2mb';
    express.json({ limit })(req, res, next);
  });

  // Reject undeliverable email addresses in any request body (see middleware).
  app.use(rejectInvalidEmailsInBody);

  app.use('/api', apiRouter);

  app.use((req, res) => {
    res.status(404).json({
      message: 'Not Found',
      path: req.originalUrl,
    });
  });

  app.use(errorHandlerMiddleware);

  return app;
}
