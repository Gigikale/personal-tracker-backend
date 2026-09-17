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

it('creates a savings goal and lets the owner contribute to it', async () => {
  const { accessToken } = await signupUser(app);

  const createRes = await request(app)
    .post('/savings-goals')
    .set(auth(accessToken))
    .send({ name: 'New laptop', targetAmount: 1000 });
  expect(createRes.status).toBe(201);
  expect(createRes.body.currentAmount).toBe('0');

  const contributeRes = await request(app)
    .post(`/savings-goals/${createRes.body.id}/contribute`)
    .set(auth(accessToken))
    .send({ amount: 250 });
  expect(contributeRes.status).toBe(200);
  expect(contributeRes.body.currentAmount).toBe('250');
});

it('rejects a withdrawal that would take the balance below 0', async () => {
  const { accessToken } = await signupUser(app);
  const goal = await request(app)
    .post('/savings-goals')
    .set(auth(accessToken))
    .send({ name: 'Emergency fund', targetAmount: 500 });

  const res = await request(app)
    .post(`/savings-goals/${goal.body.id}/contribute`)
    .set(auth(accessToken))
    .send({ amount: -50 });

  expect(res.status).toBe(400);
});

it('does not lose a contribution when two happen at the same time', async () => {
  const { accessToken } = await signupUser(app);
  const goal = await request(app)
    .post('/savings-goals')
    .set(auth(accessToken))
    .send({ name: 'Trip', targetAmount: 1000 });

  await Promise.all([
    request(app).post(`/savings-goals/${goal.body.id}/contribute`).set(auth(accessToken)).send({ amount: 50 }),
    request(app).post(`/savings-goals/${goal.body.id}/contribute`).set(auth(accessToken)).send({ amount: 30 }),
  ]);

  const final = await request(app).get(`/savings-goals/${goal.body.id}`).set(auth(accessToken));
  expect(Number(final.body.currentAmount)).toBe(80);
});

it("prevents one user from seeing or contributing to another user's savings goal", async () => {
  const owner = await signupUser(app);
  const intruder = await signupUser(app);

  const goal = await request(app)
    .post('/savings-goals')
    .set(auth(owner.accessToken))
    .send({ name: 'Vacation', targetAmount: 2000 });

  const getRes = await request(app).get(`/savings-goals/${goal.body.id}`).set(auth(intruder.accessToken));
  expect(getRes.status).toBe(404);

  const contributeRes = await request(app)
    .post(`/savings-goals/${goal.body.id}/contribute`)
    .set(auth(intruder.accessToken))
    .send({ amount: 100 });
  expect(contributeRes.status).toBe(404);
});
