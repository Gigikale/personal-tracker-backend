import * as Sentry from '@sentry/node';

import { env } from './config/env';

if (env.sentryDsn && env.nodeEnv !== 'test') {
  Sentry.init({
    dsn: env.sentryDsn,
    environment: env.nodeEnv,
    sendDefaultPii: false,
  });
}
