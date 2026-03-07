import compression from 'compression';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import pinoHttp from 'pino-http';

import { appConfig } from './config/env';
import { errorHandlerMiddleware } from './middleware/error-handler.middleware';
import { apiRouter } from './routes';
import { logger } from './utils/logger';

export function createApp() {
  const app = express();

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
    express.json()(req, res, next);
  });

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
