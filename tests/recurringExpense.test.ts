import request from 'supertest';

import { createApp } from '../src/app';
import { prisma } from '../src/prisma';
import { runRecurringExpenseSweep } from '../src/jobs/recurringExpenseScheduler';
import { resetDatabase } from './helpers/resetDb';
import { signupUser } from './helpers/testUser';

jest.mock('../src/lib/email', () => ({
  sendPasswordResetEmail: jest.fn().mockResolvedValue(undefined),
  sendHouseholdInviteEmail: jest.fn().mockResolvedValue(undefined),
  sendHouseholdMemberRemovedEmail: jest.fn().mockResolvedValue(undefined),
}));

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

it('does not double-create expenses when two sweeps overlap', async () => {
  const { accessToken } = await signupUser(app);
  const category = await request(app).post('/categories').set(auth(accessToken)).send({ name: 'Gym' });

  // One hour ago (not a full day) so a single catch-up lands nextRunDate safely ~23h in the
  // future — an exact 24h-ago start would sit right on the DAILY boundary and could flakily
  // trigger a second legitimate catch-up iteration, which isn't what this test is checking.
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  await request(app)
    .post('/recurring-expenses')
    .set(auth(accessToken))
    .send({
      categoryId: category.body.id,
      amount: 15,
      description: 'Gym membership',
      frequency: 'DAILY',
      startDate: oneHourAgo.toISOString(),
    });

  await Promise.all([runRecurringExpenseSweep(), runRecurringExpenseSweep()]);

  const expenses = await request(app).get('/expenses').set(auth(accessToken));
  const generated = expenses.body.filter((e: { description: string }) => e.description === 'Gym membership');
  expect(generated.length).toBe(1);
});

it('syncs the household budget when a recurring expense fires for a household member', async () => {
  const owner = await signupUser(app, { email: 'recurowner@example.com' });
  const partner = await signupUser(app, { email: 'recurpartner@example.com' });

  const household = await request(app).post('/households').set(auth(owner.accessToken)).send({ name: 'Home' });
  await request(app)
    .post(`/households/${household.body.id}/members`)
    .set(auth(owner.accessToken))
    .send({ email: 'recurpartner@example.com' });

  const month = new Date().getUTCMonth() + 1;
  const year = new Date().getUTCFullYear();
  await request(app)
    .post(`/households/${household.body.id}/budgets`)
    .set(auth(owner.accessToken))
    .send({ amount: 100, month, year });

  const category = await request(app).post('/categories').set(auth(partner.accessToken)).send({ name: 'Streaming' });
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
  await request(app)
    .post('/recurring-expenses')
    .set(auth(partner.accessToken))
    .send({
      categoryId: category.body.id,
      amount: 85,
      description: 'Streaming service',
      frequency: 'MONTHLY',
      startDate: yesterday.toISOString(),
    });

  await runRecurringExpenseSweep();

  const ownerNotifications = await request(app).get('/notifications').set(auth(owner.accessToken));
  const householdThresholdNotif = ownerNotifications.body.find(
    (n: { type: string; title: string }) => n.type === 'BUDGET_THRESHOLD' && n.title.includes('household'),
  );
  expect(householdThresholdNotif).toBeDefined();
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
