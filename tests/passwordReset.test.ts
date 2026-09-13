import request from 'supertest';

import { createApp } from '../src/app';
import { prisma } from '../src/prisma';
import { resetDatabase } from './helpers/resetDb';
import { signupUser } from './helpers/testUser';

jest.mock('../src/lib/email', () => ({
  sendPasswordResetEmail: jest.fn().mockResolvedValue(undefined),
}));

import { sendPasswordResetEmail } from '../src/lib/email';

const app = createApp();

beforeEach(async () => {
  await resetDatabase();
  jest.clearAllMocks();
});

afterAll(async () => {
  await prisma.$disconnect();
});

function extractToken(resetUrl: string): string {
  return new URL(resetUrl).searchParams.get('token')!;
}

function getLastResetUrl(): string {
  const mockFn = sendPasswordResetEmail as jest.Mock;
  const [, resetUrl] = mockFn.mock.calls[mockFn.mock.calls.length - 1];
  return resetUrl as string;
}

describe('POST /auth/forgot-password', () => {
  it('sends a reset email for a real account', async () => {
    await signupUser(app, { email: 'reset1@example.com' });

    const res = await request(app).post('/auth/forgot-password').send({ email: 'reset1@example.com' });
    expect(res.status).toBe(204);
    expect(sendPasswordResetEmail).toHaveBeenCalledTimes(1);
    expect(sendPasswordResetEmail).toHaveBeenCalledWith('reset1@example.com', expect.stringContaining('/reset-password?token='));
  });

  it('responds the same way for an email with no account, without sending anything', async () => {
    const res = await request(app).post('/auth/forgot-password').send({ email: 'nobody@example.com' });
    expect(res.status).toBe(204);
    expect(sendPasswordResetEmail).not.toHaveBeenCalled();
  });
});

describe('POST /auth/reset-password', () => {
  it('resets the password, revokes existing sessions, and consumes the token', async () => {
    const { refreshToken } = await signupUser(app, { email: 'reset2@example.com' });

    await request(app).post('/auth/forgot-password').send({ email: 'reset2@example.com' });
    const token = extractToken(getLastResetUrl());

    const resetRes = await request(app).post('/auth/reset-password').send({ token, password: 'newpassword123' });
    expect(resetRes.status).toBe(204);

    // Old refresh token should now be revoked.
    const refreshRes = await request(app).post('/auth/refresh').send({ refreshToken });
    expect(refreshRes.status).toBe(401);

    // New password should work.
    const loginRes = await request(app).post('/auth/login').send({ email: 'reset2@example.com', password: 'newpassword123' });
    expect(loginRes.status).toBe(200);

    // Old password should no longer work.
    const oldLoginRes = await request(app).post('/auth/login').send({ email: 'reset2@example.com', password: 'secret123' });
    expect(oldLoginRes.status).toBe(401);

    // The token should be single-use.
    const reuseRes = await request(app).post('/auth/reset-password').send({ token, password: 'yetanother123' });
    expect(reuseRes.status).toBe(400);
  });

  it('rejects an invalid or made-up token', async () => {
    const res = await request(app).post('/auth/reset-password').send({ token: 'not-a-real-token', password: 'newpassword123' });
    expect(res.status).toBe(400);
  });
});
