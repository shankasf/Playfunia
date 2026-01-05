import http from 'http';

import { createApp } from './app';
import { connectDatabase } from './config/database';
import { appConfig } from './config/env';
import { ensureDefaultAdminUser } from './services/auth.service';

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
  });
}

bootstrap().catch(error => {
  console.error('Failed to start backend server', error);
  process.exit(1);
});
