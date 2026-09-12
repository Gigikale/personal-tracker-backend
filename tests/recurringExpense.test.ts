import request from 'supertest';

import { createApp } from '../src/app';
import { prisma } from '../src/prisma';
import { runRecurringExpenseSweep } from '../src/jobs/recurringExpenseScheduler';
import { resetDatabase } from './helpers/resetDb';
import { signupUser } from './helpers/testUser';

const app = createApp();

beforeEach(async () => {
  await resetDatabase();
});

afterAll(async () => {
  await prisma.$disconnect();
});

function auth(accessToken: string) {
  return { Authorization: `Bearer ${accessToken}` };
}

it('catches up on missed daily occurrences and advances nextRunDate', async () => {
  const { accessToken } = await signupUser(app);
  const category = await request(app)
    .post('/categories')
    .set(auth(accessToken))
    .send({ name: 'Subscriptions' });

  const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
  const createRes = await request(app)
    .post('/recurring-expenses')
    .set(auth(accessToken))
    .send({
      categoryId: category.body.id,
      amount: 2.5,
      description: 'Daily coffee',
      frequency: 'DAILY',
      startDate: threeDaysAgo.toISOString(),
    });
  expect(createRes.status).toBe(201);

  await runRecurringExpenseSweep();

  const expenses = await request(app).get('/expenses').set(auth(accessToken));
  const generated = expenses.body.filter((e: { description: string }) => e.description === 'Daily coffee');
  expect(generated.length).toBeGreaterThanOrEqual(4);

  const recurring = await request(app).get('/recurring-expenses').set(auth(accessToken));
  const nextRunDate = new Date(recurring.body[0].nextRunDate);
  expect(nextRunDate.getTime()).toBeGreaterThan(Date.now());
  expect(recurring.body[0].isActive).toBe(true);

  const notifications = await request(app).get('/notifications').set(auth(accessToken));
  const recurringNotifications = notifications.body.filter(
    (n: { type: string }) => n.type === 'RECURRING_EXPENSE',
  );
  expect(recurringNotifications.length).toBe(generated.length);
});

it('deactivates the series once nextRunDate passes endDate', async () => {
  const { accessToken } = await signupUser(app);
  const category = await request(app)
    .post('/categories')
    .set(auth(accessToken))
    .send({ name: 'Trial' });

  const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
  const yesterday = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000);

  await request(app)
    .post('/recurring-expenses')
    .set(auth(accessToken))
    .send({
      categoryId: category.body.id,
      amount: 9.99,
      description: 'Trial charge',
      frequency: 'DAILY',
      startDate: twoDaysAgo.toISOString(),
      endDate: yesterday.toISOString(),
    });

  await runRecurringExpenseSweep();

  const recurring = await request(app).get('/recurring-expenses').set(auth(accessToken));
  expect(recurring.body[0].isActive).toBe(false);
});
