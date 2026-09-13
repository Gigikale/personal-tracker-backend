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

describe('POST /auth/signup', () => {
  it('creates an account and returns tokens without leaking the password hash', async () => {
    const { response } = await signupUser(app, { email: 'jordan@example.com' });

    expect(response.status).toBe(201);
    expect(response.body.accessToken).toBeDefined();
    expect(response.body.refreshToken).toBeDefined();
    expect(response.body.user.email).toBe('jordan@example.com');
    expect(response.body.user.passwordHash).toBeUndefined();
  });

  it('rejects a duplicate email with 409', async () => {
    await signupUser(app, { email: 'dup@example.com', phoneNumber: '+2348000000001' });
    const { response } = await signupUser(app, { email: 'dup@example.com', phoneNumber: '+2348000000002' });

    expect(response.status).toBe(409);
  });

  it('rejects invalid input with 400 and field errors', async () => {
    const response = await request(app).post('/auth/signup').send({ email: 'not-an-email' });

    expect(response.status).toBe(400);
    expect(response.body.errors).toHaveProperty('email');
    expect(response.body.errors).toHaveProperty('password');
  });
});

describe('POST /auth/login', () => {
  it('logs in with correct credentials', async () => {
    await signupUser(app, { email: 'login@example.com', password: 'secret123' });

    const response = await request(app)
      .post('/auth/login')
      .send({ email: 'login@example.com', password: 'secret123' });

    expect(response.status).toBe(200);
    expect(response.body.accessToken).toBeDefined();
  });

  it('rejects an incorrect password with 401', async () => {
    await signupUser(app, { email: 'login2@example.com', password: 'secret123' });

    const response = await request(app)
      .post('/auth/login')
      .send({ email: 'login2@example.com', password: 'wrong-password' });

    expect(response.status).toBe(401);
  });
});

describe('POST /auth/refresh', () => {
  it('rotates the refresh token and invalidates the old one', async () => {
    const { refreshToken } = await signupUser(app);

    const first = await request(app).post('/auth/refresh').send({ refreshToken });
    expect(first.status).toBe(200);
    expect(first.body.refreshToken).not.toBe(refreshToken);

    const second = await request(app).post('/auth/refresh').send({ refreshToken: first.body.refreshToken });
    expect(second.status).toBe(200);
  });

  it('treats reuse of an already-rotated token as theft and revokes the whole session chain', async () => {
    const { refreshToken } = await signupUser(app);

    const first = await request(app).post('/auth/refresh').send({ refreshToken });
    expect(first.status).toBe(200);

    // Replaying the original (now-rotated-out) token looks like a stolen token.
    const reuse = await request(app).post('/auth/refresh').send({ refreshToken });
    expect(reuse.status).toBe(401);

    // The legitimately-issued successor token should now be revoked too, forcing a fresh login.
    const afterReuse = await request(app).post('/auth/refresh').send({ refreshToken: first.body.refreshToken });
    expect(afterReuse.status).toBe(401);
  });
});

describe('POST /auth/logout', () => {
  it('revokes the refresh token so it can no longer be used', async () => {
    const { refreshToken } = await signupUser(app);

    const logoutRes = await request(app).post('/auth/logout').send({ refreshToken });
    expect(logoutRes.status).toBe(204);

    const refreshRes = await request(app).post('/auth/refresh').send({ refreshToken });
    expect(refreshRes.status).toBe(401);
  });
});
