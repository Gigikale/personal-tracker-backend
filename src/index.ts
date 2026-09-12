import { createServer } from 'http';

import { createApp } from './app';
import { env } from './config/env';
import { initRealtime } from './lib/realtime';
import { startRecurringExpenseScheduler } from './jobs/recurringExpenseScheduler';

const app = createApp();
const server = createServer(app);

initRealtime(server);
startRecurringExpenseScheduler();

server.listen(env.port, () => {
  console.log(`Server listening on port ${env.port}`);
});
