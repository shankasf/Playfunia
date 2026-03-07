import http from 'http';

import { createApp } from './app';
import { connectDatabase } from './config/database';
import { appConfig } from './config/env';
import { ensureDefaultAdminUser } from './services/auth.service';
import { startReconciliationScheduler, stopReconciliationScheduler } from './services/event-reconciliation.service';
import { startBookingReminderScheduler, stopBookingReminderScheduler } from './services/booking-reminder.service';
import { initializePricingCache } from './services/pricing-config.service';
import { processNotificationQueue, cleanupOldNotifications } from './services/notification-queue.service';

let notificationQueueInterval: ReturnType<typeof setInterval> | null = null;
let notificationCleanupInterval: ReturnType<typeof setInterval> | null = null;

function startNotificationQueueProcessor(): void {
  // Process queue every 30 seconds
  notificationQueueInterval = setInterval(async () => {
    try {
      await processNotificationQueue();
    } catch (err) {
      console.error('Notification queue processing error:', err);
    }
  }, 30_000);

  // Also process immediately on start to handle any backlog
  processNotificationQueue().catch(err =>
    console.error('Initial notification queue processing error:', err)
  );

  // Clean up old sent notifications daily (every 24 hours)
  notificationCleanupInterval = setInterval(async () => {
    try {
      await cleanupOldNotifications();
    } catch (err) {
      console.error('Notification cleanup error:', err);
    }
  }, 24 * 60 * 60 * 1000);
}

function stopNotificationQueueProcessor(): void {
  if (notificationQueueInterval) {
    clearInterval(notificationQueueInterval);
    notificationQueueInterval = null;
  }
  if (notificationCleanupInterval) {
    clearInterval(notificationCleanupInterval);
    notificationCleanupInterval = null;
  }
}

async function bootstrap() {
  await connectDatabase();
  await ensureDefaultAdminUser();

  // Initialize pricing cache so sync getters return correct values from the start
  try {
    await initializePricingCache();
    console.info('Pricing cache initialized');
  } catch (err) {
    console.warn('Failed to initialize pricing cache (will lazy-load on first use):', err);
  }

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

    // Start notification queue processor (runs every 30 seconds)
    startNotificationQueueProcessor();
    console.info('Notification queue processor started (every 30s)');

    // Start event reconciliation scheduler in production
    // This runs daily to recover any missed webhook events
    if (appConfig.nodeEnv === 'production') {
      startReconciliationScheduler(); // Run once daily
      console.info('Event reconciliation scheduler started (daily)');

      startBookingReminderScheduler(); // Run once daily
      console.info('Booking reminder scheduler started (daily)');
    }
  });

  // Graceful shutdown
  const shutdown = () => {
    console.info('Shutting down...');
    stopNotificationQueueProcessor();
    stopReconciliationScheduler();
    stopBookingReminderScheduler();
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
