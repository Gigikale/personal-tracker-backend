import request from 'supertest';

import { createApp } from '../src/app';
import { prisma } from '../src/prisma';
import { resetDatabase } from './helpers/resetDb';
import { signupUser } from './helpers/testUser';

jest.mock('../src/lib/googleOAuth', () => ({
  ...jest.requireActual('../src/lib/googleOAuth'),
  exchangeCodeForGoogleProfile: jest.fn(),
}));

import { exchangeCodeForGoogleProfile } from '../src/lib/googleOAuth';

const app = createApp();

beforeEach(async () => {
  await resetDatabase();
  jest.clearAllMocks();
});

afterAll(async () => {
  await prisma.$disconnect();
});

function tokensFromRedirect(location: string): { accessToken: string; refreshToken: string } {
  const fragment = new URL(location).hash.slice(1);
  const params = new URLSearchParams(fragment);
  return { accessToken: params.get('accessToken')!, refreshToken: params.get('refreshToken')! };
}

describe('GET /auth/google', () => {
  it('redirects to a Google OAuth consent URL', async () => {
    const res = await request(app).get('/auth/google');
    expect(res.status).toBe(302);
    expect(res.headers.location).toContain('accounts.google.com');
  });
});

describe('GET /auth/google/callback', () => {
  it('creates a brand-new account for a first-time Google sign-in', async () => {
    jest.mocked(exchangeCodeForGoogleProfile).mockResolvedValue({
      googleId: 'google-1',
      email: 'newgoogle@example.com',
      emailVerified: true,
      firstName: 'Gee',
      lastName: 'Oogle',
    });

    const res = await request(app).get('/auth/google/callback?code=abc');
    expect(res.status).toBe(302);
    expect(res.headers.location).toContain('/auth/callback#');

    const { accessToken } = tokensFromRedirect(res.headers.location);
    const me = await request(app).get('/users/me').set('Authorization', `Bearer ${accessToken}`);
    expect(me.status).toBe(200);
    expect(me.body.email).toBe('newgoogle@example.com');
  });

  it('logs into the same account on a repeat sign-in with the same Google id', async () => {
    jest.mocked(exchangeCodeForGoogleProfile).mockResolvedValue({
      googleId: 'google-2',
      email: 'repeatgoogle@example.com',
      emailVerified: true,
      firstName: 'Gee',
      lastName: 'Oogle',
    });

    const first = await request(app).get('/auth/google/callback?code=abc');
    const second = await request(app).get('/auth/google/callback?code=abc');

    const firstTokens = tokensFromRedirect(first.headers.location);
    const secondTokens = tokensFromRedirect(second.headers.location);

    const meFirst = await request(app).get('/users/me').set('Authorization', `Bearer ${firstTokens.accessToken}`);
    const meSecond = await request(app).get('/users/me').set('Authorization', `Bearer ${secondTokens.accessToken}`);
    expect(meFirst.body.id).toBe(meSecond.body.id);
  });

  it('links to an existing password account when Google reports the email as verified', async () => {
    const { user } = await signupUser(app, { email: 'linkme@example.com' });
    jest.mocked(exchangeCodeForGoogleProfile).mockResolvedValue({
      googleId: 'google-3',
      email: 'linkme@example.com',
      emailVerified: true,
      firstName: 'Link',
      lastName: 'Me',
    });

    const res = await request(app).get('/auth/google/callback?code=abc');
    const { accessToken } = tokensFromRedirect(res.headers.location);
    const me = await request(app).get('/users/me').set('Authorization', `Bearer ${accessToken}`);
    expect(me.body.id).toBe(user.id);
  });

  it('refuses to link to an existing account when the email is not verified by Google', async () => {
    await signupUser(app, { email: 'unverified@example.com' });
    jest.mocked(exchangeCodeForGoogleProfile).mockResolvedValue({
      googleId: 'google-4',
      email: 'unverified@example.com',
      emailVerified: false,
      firstName: 'No',
      lastName: 'Verify',
    });

    const res = await request(app).get('/auth/google/callback?code=abc');
    expect(res.status).toBe(302);
    expect(res.headers.location).toContain('/login?error=oauth_failed');
  });

  it('redirects to login with an error when no code is present', async () => {
    const res = await request(app).get('/auth/google/callback');
    expect(res.status).toBe(302);
    expect(res.headers.location).toContain('/login?error=oauth_failed');
  });
});
