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

it('exports expenses as CSV with a header row and the expense data', async () => {
  const { accessToken } = await signupUser(app);
  const category = await request(app).post('/categories').set(auth(accessToken)).send({ name: 'Food' });
  await request(app)
    .post('/expenses')
    .set(auth(accessToken))
    .send({ categoryId: category.body.id, amount: 42.5, description: 'Lunch', date: '2026-01-15T00:00:00.000Z' });

  const res = await request(app).get('/expenses/export?format=csv').set(auth(accessToken));

  expect(res.status).toBe(200);
  expect(res.headers['content-type']).toContain('text/csv');
  expect(res.text).toContain('Date,Category,Description,Amount');
  expect(res.text).toContain('2026-01-15,Food,Lunch,42.50');
});

it('exports expenses as a PDF file', async () => {
  const { accessToken } = await signupUser(app);
  const category = await request(app).post('/categories').set(auth(accessToken)).send({ name: 'Food' });
  await request(app)
    .post('/expenses')
    .set(auth(accessToken))
    .send({ categoryId: category.body.id, amount: 10, date: new Date().toISOString() });

  const res = await request(app).get('/expenses/export?format=pdf').set(auth(accessToken)).buffer(true);

  expect(res.status).toBe(200);
  expect(res.headers['content-type']).toBe('application/pdf');
  expect(Buffer.isBuffer(res.body)).toBe(true);
  expect((res.body as Buffer).subarray(0, 4).toString()).toBe('%PDF');
});

it('only exports the caller’s own expenses', async () => {
  const userA = await signupUser(app);
  const userB = await signupUser(app);

  const catA = await request(app).post('/categories').set(auth(userA.accessToken)).send({ name: 'A cat' });
  const catB = await request(app).post('/categories').set(auth(userB.accessToken)).send({ name: 'B cat' });
  await request(app)
    .post('/expenses')
    .set(auth(userA.accessToken))
    .send({ categoryId: catA.body.id, amount: 1, description: 'From A', date: new Date().toISOString() });
  await request(app)
    .post('/expenses')
    .set(auth(userB.accessToken))
    .send({ categoryId: catB.body.id, amount: 2, description: 'From B', date: new Date().toISOString() });

  const res = await request(app).get('/expenses/export?format=csv').set(auth(userA.accessToken));

  expect(res.text).toContain('From A');
  expect(res.text).not.toContain('From B');
});
