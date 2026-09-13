import pino from 'pino';

import { env } from '../config/env';

export const logger = pino({
  level: env.nodeEnv === 'test' ? 'silent' : process.env.LOG_LEVEL ?? 'info',
  transport: env.nodeEnv === 'development' ? { target: 'pino-pretty' } : undefined,
});
