import type { Express } from 'express';
import request from 'supertest';

let counter = 0;

export async function signupUser(app: Express, overrides: Record<string, unknown> = {}) {
  counter += 1;
  const payload = {
    firstName: 'Test',
    lastName: 'User',
    phoneNumber: `+234800${String(counter).padStart(7, '0')}`,
    email: `test${counter}-${Date.now()}@example.com`,
    password: 'secret123',
    ...overrides,
  };
  const res = await request(app).post('/auth/signup').send(payload);
  return {
    accessToken: res.body.accessToken as string,
    refreshToken: res.body.refreshToken as string,
    user: res.body.user,
    response: res,
  };
}
