import request from 'supertest';

import { createApp } from '../src/app';
import { prisma } from '../src/prisma';
import { resetDatabase } from './helpers/resetDb';
import { signupUser } from './helpers/testUser';

const app = createApp();

beforeEach(async () => {
  await resetDatabase();
});

afterAll(async () => {
  await prisma.$disconnect();
});

async function setupCategoryAndBudget(accessToken: string, amount = 100) {
  const category = await request(app)
    .post('/categories')
    .set('Authorization', `Bearer ${accessToken}`)
    .send({ name: 'Groceries' });

  const month = new Date().getUTCMonth() + 1;
  const year = new Date().getUTCFullYear();

  await request(app)
    .post('/budgets')
    .set('Authorization', `Bearer ${accessToken}`)
    .send({ categoryId: category.body.id, amount, month, year });

  return { categoryId: category.body.id as string, month, year };
}

function auth(accessToken: string) {
  return { Authorization: `Bearer ${accessToken}` };
}

it('fires one notification per threshold crossed, with no duplicates within a tier', async () => {
  const { accessToken } = await signupUser(app);
  const { categoryId } = await setupCategoryAndBudget(accessToken, 100);
  const today = new Date().toISOString();

  // 85% — crosses 80%
  await request(app)
    .post('/expenses')
    .set(auth(accessToken))
    .send({ categoryId, amount: 85, date: today });

  let notifications = await request(app).get('/notifications').set(auth(accessToken));
  expect(notifications.body).toHaveLength(1);
  expect(notifications.body[0].title).toContain('80%');

  // 90% — stays within the 80% tier, should NOT add another notification
  await request(app)
    .post('/expenses')
    .set(auth(accessToken))
    .send({ categoryId, amount: 5, date: today });

  notifications = await request(app).get('/notifications').set(auth(accessToken));
  expect(notifications.body).toHaveLength(1);

  // 100% — crosses the 100% tier
  await request(app)
    .post('/expenses')
    .set(auth(accessToken))
    .send({ categoryId, amount: 10, date: today });

  notifications = await request(app).get('/notifications').set(auth(accessToken));
  expect(notifications.body).toHaveLength(2);

  // 120% — crosses the 120% tier
  await request(app)
    .post('/expenses')
    .set(auth(accessToken))
    .send({ categoryId, amount: 20, date: today });

  notifications = await request(app).get('/notifications').set(auth(accessToken));
  expect(notifications.body).toHaveLength(3);
  const titles = notifications.body.map((n: { title: string }) => n.title);
  expect(titles.some((t: string) => t.includes('120%'))).toBe(true);
});

it('resets and re-notifies if spending drops below a threshold and crosses it again', async () => {
  const { accessToken } = await signupUser(app);
  const { categoryId } = await setupCategoryAndBudget(accessToken, 100);
  const today = new Date().toISOString();

  const expenseRes = await request(app)
    .post('/expenses')
    .set(auth(accessToken))
    .send({ categoryId, amount: 85, date: today });

  let notifications = await request(app).get('/notifications').set(auth(accessToken));
  expect(notifications.body).toHaveLength(1);

  // Deleting the expense drops spend back to 0%, below the 80% tier.
  await request(app).delete(`/expenses/${expenseRes.body.id}`).set(auth(accessToken));

  const budgets = await request(app).get('/budgets').set(auth(accessToken));
  expect(budgets.body[0].lastNotifiedThreshold).toBeNull();

  // Crossing 80% again should notify a second time.
  await request(app)
    .post('/expenses')
    .set(auth(accessToken))
    .send({ categoryId, amount: 85, date: today });

  notifications = await request(app).get('/notifications').set(auth(accessToken));
  expect(notifications.body).toHaveLength(2);
});
