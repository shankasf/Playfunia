import http from 'http';

import { createApp } from './app';
import { connectDatabase } from './config/database';
import { appConfig } from './config/env';
import { ensureDefaultAdminUser } from './services/auth.service';
import { startReconciliationScheduler, stopReconciliationScheduler } from './services/event-reconciliation.service';

async function bootstrap() {
  await connectDatabase();
  await ensureDefaultAdminUser();

  const app = createApp();
  const server = http.createServer(app);

  server.on('error', error => {
    if ((error as NodeJS.ErrnoException).code === 'EADDRINUSE') {
      console.error(
        `Port ${appConfig.port} is already in use. Make sure another Playfunia server is not running or update PORT in your .env file.`,
      );
      process.exit(1);
    }
    throw error;
  });

  server.listen(appConfig.port, () => {
    console.info(`Backend server listening on port ${appConfig.port}`);

    // Start event reconciliation scheduler in production
    // This runs hourly to recover any missed webhook events
    if (appConfig.nodeEnv === 'production') {
      startReconciliationScheduler(1); // Run every hour
      console.info('Event reconciliation scheduler started (hourly)');
    }
  });

  // Graceful shutdown
  const shutdown = () => {
    console.info('Shutting down...');
    stopReconciliationScheduler();
    server.close(() => {
      console.info('Server closed');
      process.exit(0);
    });
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

bootstrap().catch(error => {
  console.error('Failed to start backend server', error);
  process.exit(1);
});
