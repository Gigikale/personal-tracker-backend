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

function auth(accessToken: string) {
  return { Authorization: `Bearer ${accessToken}` };
}

it('reports the total amount of every matching expense across all pages', async () => {
  const { accessToken } = await signupUser(app);
  const events = await request(app).post('/categories').set(auth(accessToken)).send({ name: 'Event' });
  const food = await request(app).post('/categories').set(auth(accessToken)).send({ name: 'Food' });
  const add = (categoryId: string, amount: number, date: string) =>
    request(app).post('/expenses').set(auth(accessToken)).send({ categoryId, amount, date });

  await add(events.body.id, 5000, '2026-04-26T00:00:00.000Z');
  await add(events.body.id, 5000, '2026-08-25T00:00:00.000Z');
  await add(events.body.id, 5000, '2026-11-09T00:00:00.000Z');
  await add(events.body.id, 7000, '2025-11-01T00:00:00.000Z'); // previous year
  await add(food.body.id, 1234.5, '2026-06-01T00:00:00.000Z');

  const yearInEvents = await request(app)
    .get('/expenses')
    .query({
      categoryId: events.body.id,
      from: '2026-01-01T00:00:00.000Z',
      to: '2026-12-31T23:59:59.999Z',
      limit: 2,
    })
    .set(auth(accessToken));

  expect(yearInEvents.status).toBe(200);
  expect(yearInEvents.body).toHaveLength(2); // one page...
  expect(yearInEvents.headers['x-total-count']).toBe('3');
  expect(yearInEvents.headers['x-total-amount']).toBe('15000.00'); // ...but the total covers all three

  const everything = await request(app).get('/expenses').set(auth(accessToken));
  expect(everything.headers['x-total-amount']).toBe('23234.50');
});

it('reports a zero total when nothing matches', async () => {
  const { accessToken } = await signupUser(app);

  const res = await request(app).get('/expenses').set(auth(accessToken));

  expect(res.headers['x-total-count']).toBe('0');
  expect(res.headers['x-total-amount']).toBe('0.00');
});
