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

function monthsAgo(n: number): { month: number; year: number } {
  const now = new Date();
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - n, 15));
  return { month: d.getUTCMonth() + 1, year: d.getUTCFullYear() };
}

describe('GET /budgets/trend', () => {
  it('returns the requested number of months, oldest first, ending on the current month', async () => {
    const { accessToken } = await signupUser(app);

    const res = await request(app).get('/budgets/trend?months=3').set(auth(accessToken));

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(3);

    const current = monthsAgo(0);
    const oldest = monthsAgo(2);
    expect(res.body[0]).toMatchObject({ month: oldest.month, year: oldest.year });
    expect(res.body[2]).toMatchObject({ month: current.month, year: current.year });
  });

  it('defaults to 6 months when no months param is given', async () => {
    const { accessToken } = await signupUser(app);
    const res = await request(app).get('/budgets/trend').set(auth(accessToken));
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(6);
  });

  it('reports actual spend and budget usage per past month, isolated by period', async () => {
    const { accessToken } = await signupUser(app);
    const category = await request(app).post('/categories').set(auth(accessToken)).send({ name: 'Dining' });

    const twoMonthsAgo = monthsAgo(2);
    const lastMonth = monthsAgo(1);

    await request(app)
      .post('/budgets')
      .set(auth(accessToken))
      .send({ amount: 100, month: twoMonthsAgo.month, year: twoMonthsAgo.year });
    await request(app)
      .post('/expenses')
      .set(auth(accessToken))
      .send({
        categoryId: category.body.id,
        amount: 80,
        date: new Date(Date.UTC(twoMonthsAgo.year, twoMonthsAgo.month - 1, 10)).toISOString(),
      });
    await request(app)
      .post('/expenses')
      .set(auth(accessToken))
      .send({
        categoryId: category.body.id,
        amount: 25,
        date: new Date(Date.UTC(lastMonth.year, lastMonth.month - 1, 10)).toISOString(),
      });

    const res = await request(app).get('/budgets/trend?months=3').set(auth(accessToken));
    expect(res.status).toBe(200);

    const twoMonthsAgoPoint = res.body.find(
      (p: { month: number; year: number }) => p.month === twoMonthsAgo.month && p.year === twoMonthsAgo.year,
    );
    expect(twoMonthsAgoPoint.budgetAmount).toBe(100);
    expect(twoMonthsAgoPoint.actualSpent).toBe(80);
    expect(twoMonthsAgoPoint.byCategory).toEqual([{ categoryId: category.body.id, categoryName: 'Dining', spent: 80 }]);

    const lastMonthPoint = res.body.find(
      (p: { month: number; year: number }) => p.month === lastMonth.month && p.year === lastMonth.year,
    );
    expect(lastMonthPoint.budgetAmount).toBeNull();
    expect(lastMonthPoint.actualSpent).toBe(25);
  });

  it('rejects an out-of-range months param', async () => {
    const { accessToken } = await signupUser(app);
    const res = await request(app).get('/budgets/trend?months=25').set(auth(accessToken));
    expect(res.status).toBe(400);
  });
});
