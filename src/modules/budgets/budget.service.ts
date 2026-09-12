import { prisma } from '../../prisma';
import { HttpError } from '../../lib/errors';
import { toHttpError } from '../../lib/prismaErrors';
import { formatMoney } from '../../lib/currency';
import { getOwnedCategoryOrThrow } from '../categories/category.service';
import { createNotification } from '../notifications/notification.service';
import type { BudgetSummaryQuery, CreateBudgetInput, ListBudgetsQuery, UpdateBudgetInput } from './budget.schemas';

const THRESHOLDS = [120, 100, 80] as const;

interface CategorySummary {
  categoryId: string;
  categoryName: string;
  budgetAmount: number | null;
  actualSpent: number;
  remaining: number | null;
  percentUsed: number | null;
}

export async function createBudget(userId: string, input: CreateBudgetInput) {
  if (input.categoryId) {
    await getOwnedCategoryOrThrow(userId, input.categoryId);
  }
  try {
    return await prisma.budget.create({
      data: {
        userId,
        categoryId: input.categoryId ?? null,
        amount: input.amount,
        month: input.month,
        year: input.year,
      },
    });
  } catch (err) {
    toHttpError(err, 'A budget already exists for this category and period');
  }
}

export function listBudgets(userId: string, query: ListBudgetsQuery) {
  return prisma.budget.findMany({
    where: {
      userId,
      deletedAt: null,
      ...(query.month ? { month: query.month } : {}),
      ...(query.year ? { year: query.year } : {}),
    },
    orderBy: [{ year: 'desc' }, { month: 'desc' }],
  });
}

export async function getBudget(userId: string, id: string) {
  const budget = await prisma.budget.findFirst({
    where: { id, userId, deletedAt: null },
  });
  if (!budget) {
    throw new HttpError(404, 'Budget not found');
  }
  return budget;
}

export async function updateBudget(userId: string, id: string, input: UpdateBudgetInput) {
  await getBudget(userId, id);
  return prisma.budget.update({
    where: { id },
    data: input,
  });
}

export async function deleteBudget(userId: string, id: string): Promise<void> {
  await getBudget(userId, id);
  await prisma.budget.update({
    where: { id },
    data: { deletedAt: new Date() },
  });
}

export async function getBudgetSummary(userId: string, query: BudgetSummaryQuery) {
  const now = new Date();
  const month = query.month ?? now.getUTCMonth() + 1;
  const year = query.year ?? now.getUTCFullYear();

  const periodStart = new Date(Date.UTC(year, month - 1, 1));
  const periodEnd = new Date(Date.UTC(year, month, 1));

  const [budgets, expenseTotals, overallActual] = await Promise.all([
    prisma.budget.findMany({
      where: { userId, deletedAt: null, month, year },
    }),
    prisma.expense.groupBy({
      by: ['categoryId'],
      where: { userId, deletedAt: null, date: { gte: periodStart, lt: periodEnd } },
      _sum: { amount: true },
    }),
    prisma.expense.aggregate({
      where: { userId, deletedAt: null, date: { gte: periodStart, lt: periodEnd } },
      _sum: { amount: true },
    }),
  ]);

  const categoryIds = Array.from(
    new Set([
      ...budgets.filter((b) => b.categoryId).map((b) => b.categoryId as string),
      ...expenseTotals.map((e) => e.categoryId),
    ]),
  );

  const categories = categoryIds.length
    ? await prisma.category.findMany({ where: { id: { in: categoryIds } } })
    : [];
  const categoryNameById = new Map(categories.map((c) => [c.id, c.name]));
  const spentByCategoryId = new Map(expenseTotals.map((e) => [e.categoryId, Number(e._sum.amount ?? 0)]));
  const budgetByCategoryId = new Map(
    budgets.filter((b) => b.categoryId).map((b) => [b.categoryId as string, Number(b.amount)]),
  );

  const overallBudget = budgets.find((b) => b.categoryId === null);
  const overallBudgetAmount = overallBudget ? Number(overallBudget.amount) : null;
  const overallSpent = Number(overallActual._sum.amount ?? 0);

  const categorySummaries: CategorySummary[] = categoryIds.map((categoryId) => {
    const budgetAmount = budgetByCategoryId.get(categoryId) ?? null;
    const actualSpent = spentByCategoryId.get(categoryId) ?? 0;
    return {
      categoryId,
      categoryName: categoryNameById.get(categoryId) ?? 'Unknown category',
      budgetAmount,
      actualSpent,
      remaining: budgetAmount !== null ? budgetAmount - actualSpent : null,
      percentUsed: budgetAmount ? Math.round((actualSpent / budgetAmount) * 1000) / 10 : null,
    };
  });

  categorySummaries.sort((a, b) => b.actualSpent - a.actualSpent);

  return {
    month,
    year,
    overall: {
      budgetAmount: overallBudgetAmount,
      actualSpent: overallSpent,
      remaining: overallBudgetAmount !== null ? overallBudgetAmount - overallSpent : null,
      percentUsed: overallBudgetAmount ? Math.round((overallSpent / overallBudgetAmount) * 1000) / 10 : null,
    },
    categories: categorySummaries,
  };
}

async function syncOneBudgetThreshold(
  userId: string,
  budget: { id: string; amount: unknown; categoryId: string | null; lastNotifiedThreshold: number | null },
  actualSpent: number,
  currency: string,
  categoryName?: string,
): Promise<void> {
  const budgetAmount = Number(budget.amount);
  const percentUsed = budgetAmount > 0 ? (actualSpent / budgetAmount) * 100 : 0;
  const crossed = THRESHOLDS.find((t) => percentUsed >= t) ?? null;

  if (crossed === budget.lastNotifiedThreshold) return;

  if ((crossed ?? 0) > (budget.lastNotifiedThreshold ?? 0)) {
    const subject = categoryName ? `${categoryName} budget` : 'overall budget';
    await createNotification(userId, {
      type: 'BUDGET_THRESHOLD',
      title: `${crossed}% of ${subject} used`,
      message: `You've used ${Math.round(percentUsed)}% of your ${subject} for this period (${formatMoney(actualSpent, currency)} of ${formatMoney(budgetAmount, currency)}).`,
      metadata: { budgetId: budget.id, categoryId: budget.categoryId, threshold: crossed, percentUsed },
    });
  }

  await prisma.budget.update({
    where: { id: budget.id },
    data: { lastNotifiedThreshold: crossed },
  });
}

export async function syncBudgetThresholds(userId: string, categoryId: string, date: Date): Promise<void> {
  const month = date.getUTCMonth() + 1;
  const year = date.getUTCFullYear();
  const periodStart = new Date(Date.UTC(year, month - 1, 1));
  const periodEnd = new Date(Date.UTC(year, month, 1));

  const [categoryBudget, overallBudget] = await Promise.all([
    prisma.budget.findFirst({ where: { userId, categoryId, month, year, deletedAt: null } }),
    prisma.budget.findFirst({ where: { userId, categoryId: null, month, year, deletedAt: null } }),
  ]);

  if (!categoryBudget && !overallBudget) return;

  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { currency: true } });

  const [categoryTotal, overallTotal] = await Promise.all([
    categoryBudget
      ? prisma.expense.aggregate({
          where: { userId, categoryId, deletedAt: null, date: { gte: periodStart, lt: periodEnd } },
          _sum: { amount: true },
        })
      : null,
    overallBudget
      ? prisma.expense.aggregate({
          where: { userId, deletedAt: null, date: { gte: periodStart, lt: periodEnd } },
          _sum: { amount: true },
        })
      : null,
  ]);

  if (categoryBudget && categoryTotal) {
    const category = await prisma.category.findUnique({ where: { id: categoryId } });
    await syncOneBudgetThreshold(
      userId,
      categoryBudget,
      Number(categoryTotal._sum.amount ?? 0),
      user.currency,
      category?.name,
    );
  }

  if (overallBudget && overallTotal) {
    await syncOneBudgetThreshold(userId, overallBudget, Number(overallTotal._sum.amount ?? 0), user.currency);
  }
}
