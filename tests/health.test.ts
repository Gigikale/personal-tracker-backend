import request from 'supertest';

import { createApp } from '../src/app';
import { prisma } from '../src/prisma';

const app = createApp();

afterAll(async () => {
  await prisma.$disconnect();
});

it('reports ok with a live database connection', async () => {
  const res = await request(app).get('/health');
  expect(res.status).toBe(200);
  expect(res.body).toEqual({ status: 'ok', database: 'ok' });
});
