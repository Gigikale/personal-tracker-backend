import request from 'supertest';

import { createApp } from '../src/app';
import { prisma } from '../src/prisma';
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

it('creates a household with the creator as owner, then adds a member by email', async () => {
  const owner = await signupUser(app, { email: 'owner@example.com' });
  const partner = await signupUser(app, { email: 'partner@example.com' });

  const createRes = await request(app).post('/households').set(auth(owner.accessToken)).send({ name: 'Our home' });
  expect(createRes.status).toBe(201);
  expect(createRes.body.members).toHaveLength(1);
  expect(createRes.body.members[0].role).toBe('OWNER');

  const addRes = await request(app)
    .post(`/households/${createRes.body.id}/members`)
    .set(auth(owner.accessToken))
    .send({ email: 'partner@example.com' });
  expect(addRes.status).toBe(201);
  expect(addRes.body.members).toHaveLength(2);

  const partnerView = await request(app).get(`/households/${createRes.body.id}`).set(auth(partner.accessToken));
  expect(partnerView.status).toBe(200);
});

it('rejects a non-owner trying to add members', async () => {
  const owner = await signupUser(app);
  const member = await signupUser(app, { email: 'member@example.com' });
  await signupUser(app, { email: 'outsider@example.com' });

  const household = await request(app).post('/households').set(auth(owner.accessToken)).send({ name: 'Home' });
  await request(app)
    .post(`/households/${household.body.id}/members`)
    .set(auth(owner.accessToken))
    .send({ email: 'member@example.com' });

  const res = await request(app)
    .post(`/households/${household.body.id}/members`)
    .set(auth(member.accessToken))
    .send({ email: 'outsider@example.com' });
  expect(res.status).toBe(403);
});

it('lets the owner rename a household but rejects a non-owner', async () => {
  const owner = await signupUser(app);
  const member = await signupUser(app, { email: 'member@example.com' });

  const household = await request(app).post('/households').set(auth(owner.accessToken)).send({ name: 'Home' });
  await request(app)
    .post(`/households/${household.body.id}/members`)
    .set(auth(owner.accessToken))
    .send({ email: 'member@example.com' });

  const rejected = await request(app)
    .patch(`/households/${household.body.id}`)
    .set(auth(member.accessToken))
    .send({ name: 'Hijacked name' });
  expect(rejected.status).toBe(403);

  const renamed = await request(app)
    .patch(`/households/${household.body.id}`)
    .set(auth(owner.accessToken))
    .send({ name: 'Our home' });
  expect(renamed.status).toBe(200);
  expect(renamed.body.name).toBe('Our home');
});

it('lets the owner delete a household but rejects a non-owner', async () => {
  const owner = await signupUser(app);
  const member = await signupUser(app, { email: 'member@example.com' });

  const household = await request(app).post('/households').set(auth(owner.accessToken)).send({ name: 'Home' });
  await request(app)
    .post(`/households/${household.body.id}/members`)
    .set(auth(owner.accessToken))
    .send({ email: 'member@example.com' });

  const rejected = await request(app).delete(`/households/${household.body.id}`).set(auth(member.accessToken));
  expect(rejected.status).toBe(403);

  const deleted = await request(app).delete(`/households/${household.body.id}`).set(auth(owner.accessToken));
  expect(deleted.status).toBe(204);

  const listAfter = await request(app).get('/households').set(auth(owner.accessToken));
  expect(listAfter.body).toHaveLength(0);
});

it('hides the household from non-members entirely', async () => {
  const owner = await signupUser(app);
  const outsider = await signupUser(app);

  const household = await request(app).post('/households').set(auth(owner.accessToken)).send({ name: 'Home' });

  const res = await request(app).get(`/households/${household.body.id}`).set(auth(outsider.accessToken));
  expect(res.status).toBe(404);
});

it('aggregates spend across all household members for the budget summary', async () => {
  const owner = await signupUser(app, { email: 'owner2@example.com' });
  const partner = await signupUser(app, { email: 'partner2@example.com' });

  const household = await request(app).post('/households').set(auth(owner.accessToken)).send({ name: 'Home' });
  await request(app)
    .post(`/households/${household.body.id}/members`)
    .set(auth(owner.accessToken))
    .send({ email: 'partner2@example.com' });

  const month = new Date().getUTCMonth() + 1;
  const year = new Date().getUTCFullYear();
  await request(app)
    .post(`/households/${household.body.id}/budgets`)
    .set(auth(owner.accessToken))
    .send({ amount: 500, month, year });

  const ownerCategory = await request(app).post('/categories').set(auth(owner.accessToken)).send({ name: 'Rent' });
  const partnerCategory = await request(app)
    .post('/categories')
    .set(auth(partner.accessToken))
    .send({ name: 'Groceries' });

  await request(app)
    .post('/expenses')
    .set(auth(owner.accessToken))
    .send({ categoryId: ownerCategory.body.id, amount: 200, date: new Date().toISOString() });
  await request(app)
    .post('/expenses')
    .set(auth(partner.accessToken))
    .send({ categoryId: partnerCategory.body.id, amount: 100, date: new Date().toISOString() });

  const summary = await request(app)
    .get(`/households/${household.body.id}/budgets/summary`)
    .set(auth(owner.accessToken));

  expect(summary.status).toBe(200);
  expect(summary.body.actualSpent).toBe(300);
  expect(summary.body.budgetAmount).toBe(500);
  expect(summary.body.byMember).toHaveLength(2);
});

it('exposes budgetId in the summary and lets any member update or delete the shared budget', async () => {
  const owner = await signupUser(app);
  const partner = await signupUser(app, { email: 'partner3@example.com' });

  const household = await request(app).post('/households').set(auth(owner.accessToken)).send({ name: 'Home' });
  await request(app)
    .post(`/households/${household.body.id}/members`)
    .set(auth(owner.accessToken))
    .send({ email: 'partner3@example.com' });

  const month = new Date().getUTCMonth() + 1;
  const year = new Date().getUTCFullYear();
  const created = await request(app)
    .post(`/households/${household.body.id}/budgets`)
    .set(auth(owner.accessToken))
    .send({ amount: 500, month, year });

  const summaryBefore = await request(app)
    .get(`/households/${household.body.id}/budgets/summary`)
    .set(auth(owner.accessToken));
  expect(summaryBefore.body.budgetId).toBe(created.body.id);

  const updated = await request(app)
    .patch(`/households/${household.body.id}/budgets/${created.body.id}`)
    .set(auth(partner.accessToken))
    .send({ amount: 750 });
  expect(updated.status).toBe(200);
  expect(Number(updated.body.amount)).toBe(750);

  const deleted = await request(app)
    .delete(`/households/${household.body.id}/budgets/${created.body.id}`)
    .set(auth(partner.accessToken));
  expect(deleted.status).toBe(204);

  const summaryAfter = await request(app)
    .get(`/households/${household.body.id}/budgets/summary`)
    .set(auth(owner.accessToken));
  expect(summaryAfter.body.budgetId).toBeNull();
  expect(summaryAfter.body.budgetAmount).toBeNull();
});

it('flags hasMixedCurrencies when household members use different currencies', async () => {
  const owner = await signupUser(app, { email: 'owner4@example.com' });
  const partner = await signupUser(app, { email: 'partner4@example.com' });

  const household = await request(app).post('/households').set(auth(owner.accessToken)).send({ name: 'Home' });
  await request(app)
    .post(`/households/${household.body.id}/members`)
    .set(auth(owner.accessToken))
    .send({ email: 'partner4@example.com' });

  const sameCurrency = await request(app)
    .get(`/households/${household.body.id}/budgets/summary`)
    .set(auth(owner.accessToken));
  expect(sameCurrency.body.hasMixedCurrencies).toBe(false);
  expect(sameCurrency.body.byMember.every((m: { currency: string }) => m.currency === 'USD')).toBe(true);

  await request(app).patch('/users/me').set(auth(partner.accessToken)).send({ currency: 'NGN' });

  const mixed = await request(app)
    .get(`/households/${household.body.id}/budgets/summary`)
    .set(auth(owner.accessToken));
  expect(mixed.body.hasMixedCurrencies).toBe(true);
});

it('notifies every household member when the shared budget crosses a threshold', async () => {
  const owner = await signupUser(app, { email: 'owner3@example.com' });
  const partner = await signupUser(app, { email: 'partner3@example.com' });

  const household = await request(app).post('/households').set(auth(owner.accessToken)).send({ name: 'Home' });
  await request(app)
    .post(`/households/${household.body.id}/members`)
    .set(auth(owner.accessToken))
    .send({ email: 'partner3@example.com' });

  const month = new Date().getUTCMonth() + 1;
  const year = new Date().getUTCFullYear();
  await request(app)
    .post(`/households/${household.body.id}/budgets`)
    .set(auth(owner.accessToken))
    .send({ amount: 500, month, year });

  const ownerCategory = await request(app).post('/categories').set(auth(owner.accessToken)).send({ name: 'Rent' });
  const partnerCategory = await request(app)
    .post('/categories')
    .set(auth(partner.accessToken))
    .send({ name: 'Groceries' });

  // Combined spend hits exactly 80% of the $500 shared budget (250 + 150 = 400).
  await request(app)
    .post('/expenses')
    .set(auth(owner.accessToken))
    .send({ categoryId: ownerCategory.body.id, amount: 250, date: new Date().toISOString() });
  await request(app)
    .post('/expenses')
    .set(auth(partner.accessToken))
    .send({ categoryId: partnerCategory.body.id, amount: 150, date: new Date().toISOString() });

  const ownerNotifications = await request(app).get('/notifications').set(auth(owner.accessToken));
  const partnerNotifications = await request(app).get('/notifications').set(auth(partner.accessToken));

  const ownerThresholdNotif = ownerNotifications.body.find(
    (n: { type: string; title: string }) => n.type === 'BUDGET_THRESHOLD' && n.title.includes('household'),
  );
  const partnerThresholdNotif = partnerNotifications.body.find(
    (n: { type: string; title: string }) => n.type === 'BUDGET_THRESHOLD' && n.title.includes('household'),
  );

  expect(ownerThresholdNotif).toBeDefined();
  expect(partnerThresholdNotif).toBeDefined();
  expect(ownerThresholdNotif.title).toContain('80%');
});
