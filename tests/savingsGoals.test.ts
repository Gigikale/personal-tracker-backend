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

it('records each contribution with its amount, note and date, newest first', async () => {
  const { accessToken } = await signupUser(app);
  const goal = await request(app)
    .post('/savings-goals')
    .set(auth(accessToken))
    .send({ name: 'Car', targetAmount: 5000 });

  await request(app)
    .post(`/savings-goals/${goal.body.id}/contribute`)
    .set(auth(accessToken))
    .send({ amount: 300, note: 'October salary', contributedAt: '2026-10-28T00:00:00.000Z' });
  await request(app)
    .post(`/savings-goals/${goal.body.id}/contribute`)
    .set(auth(accessToken))
    .send({ amount: -100, contributedAt: '2026-11-05T00:00:00.000Z' });

  const res = await request(app).get(`/savings-goals/${goal.body.id}/contributions`).set(auth(accessToken));

  expect(res.status).toBe(200);
  expect(res.body).toHaveLength(2);
  expect(res.body[0]).toMatchObject({
    amount: '-100',
    note: null,
    contributedAt: '2026-11-05T00:00:00.000Z',
  });
  expect(res.body[1]).toMatchObject({
    amount: '300',
    note: 'October salary',
    contributedAt: '2026-10-28T00:00:00.000Z',
  });
});

it('does not record a contribution that was rejected', async () => {
  const { accessToken } = await signupUser(app);
  const goal = await request(app)
    .post('/savings-goals')
    .set(auth(accessToken))
    .send({ name: 'Phone', targetAmount: 800 });

  await request(app).post(`/savings-goals/${goal.body.id}/contribute`).set(auth(accessToken)).send({ amount: -50 });

  const res = await request(app).get(`/savings-goals/${goal.body.id}/contributions`).set(auth(accessToken));
  expect(res.body).toHaveLength(0);
});

it('rejects a contribution dated in the future', async () => {
  const { accessToken } = await signupUser(app);
  const goal = await request(app)
    .post('/savings-goals')
    .set(auth(accessToken))
    .send({ name: 'Bike', targetAmount: 600 });
  const nextWeek = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  const res = await request(app)
    .post(`/savings-goals/${goal.body.id}/contribute`)
    .set(auth(accessToken))
    .send({ amount: 50, contributedAt: nextWeek });

  expect(res.status).toBe(400);
});

it("does not show another user's contribution history", async () => {
  const owner = await signupUser(app);
  const intruder = await signupUser(app);
  const goal = await request(app)
    .post('/savings-goals')
    .set(auth(owner.accessToken))
    .send({ name: 'Wedding', targetAmount: 10000 });

  const res = await request(app).get(`/savings-goals/${goal.body.id}/contributions`).set(auth(intruder.accessToken));
  expect(res.status).toBe(404);
});

async function goalWithContribution(accessToken: string, amount: number) {
  const goal = await request(app)
    .post('/savings-goals')
    .set(auth(accessToken))
    .send({ name: 'House', targetAmount: 20000 });
  await request(app).post(`/savings-goals/${goal.body.id}/contribute`).set(auth(accessToken)).send({ amount });
  const history = await request(app).get(`/savings-goals/${goal.body.id}/contributions`).set(auth(accessToken));
  return { goalId: goal.body.id as string, contributionId: history.body[0].id as string };
}

it('edits a contribution and moves the goal balance by the difference', async () => {
  const { accessToken } = await signupUser(app);
  const { goalId, contributionId } = await goalWithContribution(accessToken, 200);

  const res = await request(app)
    .patch(`/savings-goals/${goalId}/contributions/${contributionId}`)
    .set(auth(accessToken))
    .send({ amount: 250.1, note: 'Fixed typo', contributedAt: '2026-11-01T00:00:00.000Z' });

  expect(res.status).toBe(200);
  expect(res.body).toMatchObject({
    amount: '250.1',
    note: 'Fixed typo',
    contributedAt: '2026-11-01T00:00:00.000Z',
  });
  const goal = await request(app).get(`/savings-goals/${goalId}`).set(auth(accessToken));
  expect(goal.body.currentAmount).toBe('250.1');
});

it('clears a note without touching the balance', async () => {
  const { accessToken } = await signupUser(app);
  const { goalId, contributionId } = await goalWithContribution(accessToken, 75);
  await request(app)
    .patch(`/savings-goals/${goalId}/contributions/${contributionId}`)
    .set(auth(accessToken))
    .send({ note: 'Temporary' });

  const res = await request(app)
    .patch(`/savings-goals/${goalId}/contributions/${contributionId}`)
    .set(auth(accessToken))
    .send({ note: null });

  expect(res.body.note).toBeNull();
  const goal = await request(app).get(`/savings-goals/${goalId}`).set(auth(accessToken));
  expect(goal.body.currentAmount).toBe('75');
});

it('deletes a contribution and takes its amount back off the goal', async () => {
  const { accessToken } = await signupUser(app);
  const { goalId, contributionId } = await goalWithContribution(accessToken, 120);
  await request(app).post(`/savings-goals/${goalId}/contribute`).set(auth(accessToken)).send({ amount: 30 });

  const res = await request(app)
    .delete(`/savings-goals/${goalId}/contributions/${contributionId}`)
    .set(auth(accessToken));

  expect(res.status).toBe(204);
  const goal = await request(app).get(`/savings-goals/${goalId}`).set(auth(accessToken));
  expect(goal.body.currentAmount).toBe('30');
  const history = await request(app).get(`/savings-goals/${goalId}/contributions`).set(auth(accessToken));
  expect(history.body).toHaveLength(1);
});

it('refuses an edit or delete that would take the balance below 0', async () => {
  const { accessToken } = await signupUser(app);
  const { goalId, contributionId } = await goalWithContribution(accessToken, 100);
  await request(app).post(`/savings-goals/${goalId}/contribute`).set(auth(accessToken)).send({ amount: -80 });

  const editRes = await request(app)
    .patch(`/savings-goals/${goalId}/contributions/${contributionId}`)
    .set(auth(accessToken))
    .send({ amount: 50 });
  const deleteRes = await request(app)
    .delete(`/savings-goals/${goalId}/contributions/${contributionId}`)
    .set(auth(accessToken));

  expect(editRes.status).toBe(400);
  expect(deleteRes.status).toBe(400);
  const goal = await request(app).get(`/savings-goals/${goalId}`).set(auth(accessToken));
  expect(goal.body.currentAmount).toBe('20');
});

it('does not let another user edit or delete a contribution', async () => {
  const owner = await signupUser(app);
  const intruder = await signupUser(app);
  const { goalId, contributionId } = await goalWithContribution(owner.accessToken, 60);

  const editRes = await request(app)
    .patch(`/savings-goals/${goalId}/contributions/${contributionId}`)
    .set(auth(intruder.accessToken))
    .send({ amount: 1 });
  const deleteRes = await request(app)
    .delete(`/savings-goals/${goalId}/contributions/${contributionId}`)
    .set(auth(intruder.accessToken));

  expect(editRes.status).toBe(404);
  expect(deleteRes.status).toBe(404);
});
