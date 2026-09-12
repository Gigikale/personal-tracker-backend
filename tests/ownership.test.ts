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

it("blocks requests with no access token", async () => {
  const response = await request(app).get('/categories');
  expect(response.status).toBe(401);
});

it("prevents one user from reading, updating, or deleting another user's category", async () => {
  const owner = await signupUser(app);
  const intruder = await signupUser(app);

  const createRes = await request(app)
    .post('/categories')
    .set('Authorization', `Bearer ${owner.accessToken}`)
    .send({ name: 'Groceries' });
  const categoryId = createRes.body.id;

  const getRes = await request(app)
    .get(`/categories/${categoryId}`)
    .set('Authorization', `Bearer ${intruder.accessToken}`);
  expect(getRes.status).toBe(404);

  const updateRes = await request(app)
    .patch(`/categories/${categoryId}`)
    .set('Authorization', `Bearer ${intruder.accessToken}`)
    .send({ name: 'Hacked' });
  expect(updateRes.status).toBe(404);

  const deleteRes = await request(app)
    .delete(`/categories/${categoryId}`)
    .set('Authorization', `Bearer ${intruder.accessToken}`);
  expect(deleteRes.status).toBe(404);

  const ownerStillSees = await request(app)
    .get(`/categories/${categoryId}`)
    .set('Authorization', `Bearer ${owner.accessToken}`);
  expect(ownerStillSees.status).toBe(200);
  expect(ownerStillSees.body.name).toBe('Groceries');
});

it('only lists expenses belonging to the caller', async () => {
  const userA = await signupUser(app);
  const userB = await signupUser(app);

  const catA = await request(app)
    .post('/categories')
    .set('Authorization', `Bearer ${userA.accessToken}`)
    .send({ name: 'Food' });
  const catB = await request(app)
    .post('/categories')
    .set('Authorization', `Bearer ${userB.accessToken}`)
    .send({ name: 'Food' });

  await request(app)
    .post('/expenses')
    .set('Authorization', `Bearer ${userA.accessToken}`)
    .send({ categoryId: catA.body.id, amount: 10, date: new Date().toISOString() });
  await request(app)
    .post('/expenses')
    .set('Authorization', `Bearer ${userB.accessToken}`)
    .send({ categoryId: catB.body.id, amount: 20, date: new Date().toISOString() });

  const listA = await request(app).get('/expenses').set('Authorization', `Bearer ${userA.accessToken}`);
  expect(listA.body).toHaveLength(1);
  expect(listA.body[0].amount).toBe('10');
});
