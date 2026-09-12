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

describe('GET /users/me', () => {
  it('defaults to USD currency for a new user', async () => {
    const { accessToken } = await signupUser(app);

    const response = await request(app).get('/users/me').set('Authorization', `Bearer ${accessToken}`);

    expect(response.status).toBe(200);
    expect(response.body.currency).toBe('USD');
  });
});

describe('PATCH /users/me', () => {
  it('updates the currency preference', async () => {
    const { accessToken } = await signupUser(app);

    const response = await request(app)
      .patch('/users/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ currency: 'NGN' });

    expect(response.status).toBe(200);
    expect(response.body.currency).toBe('NGN');

    const getResponse = await request(app).get('/users/me').set('Authorization', `Bearer ${accessToken}`);
    expect(getResponse.body.currency).toBe('NGN');
  });

  it('rejects an unsupported currency code', async () => {
    const { accessToken } = await signupUser(app);

    const response = await request(app)
      .patch('/users/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ currency: 'GBP' });

    expect(response.status).toBe(400);
  });

  it('requires authentication', async () => {
    const response = await request(app).get('/users/me');
    expect(response.status).toBe(401);
  });
});
