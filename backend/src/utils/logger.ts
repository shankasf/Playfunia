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
};

export const logger = pino(loggerOptions);
