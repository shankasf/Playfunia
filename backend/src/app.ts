import compression from 'compression';
import cors from 'cors';
import express from 'express';
import pinoHttp from 'pino-http';

import { appConfig } from './config/env';
import { apiRouter } from './routes';
import { isAppError } from './utils/app-error';
import { logger } from './utils/logger';

export function createApp() {
  const app = express();

  // Enable gzip compression for all responses
  app.use(compression());

  app.use(pinoHttp({ logger }));

  app.use(
    cors({
      origin: appConfig.corsOrigin?.split(',').map(origin => origin.trim()) ?? '*',
      credentials: true,
    }),
  );
  app.use(express.json());

  app.use('/api', apiRouter);

  app.use((req, res) => {
    res.status(404).json({
      message: 'Not Found',
      path: req.originalUrl,
    });
  });

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use(
    (error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
      if (isAppError(error)) {
        if (error.statusCode >= 500) {
          console.error('App error:', error);
        }
        return res.status(error.statusCode).json({ message: error.message });
      }

      console.error('Unhandled error:', error);
      return res.status(500).json({ message: 'Internal Server Error' });
    },
  );

  return app;
}
