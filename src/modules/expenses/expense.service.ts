import { Prisma } from '@prisma/client';

import { prisma } from '../../prisma';
import { HttpError } from '../../lib/errors';
import { getOwnedCategoryOrThrow } from '../categories/category.service';
import { syncBudgetThresholds } from '../budgets/budget.service';
import { syncHouseholdBudgetsForUser } from '../households/household.service';
import type { CreateExpenseInput, ListExpensesQuery, UpdateExpenseInput } from './expense.schemas';

export async function createExpense(userId: string, input: CreateExpenseInput) {
  await getOwnedCategoryOrThrow(userId, input.categoryId);
  const expense = await prisma.expense.create({
    data: { userId, ...input },
  });
  await syncBudgetThresholds(userId, expense.categoryId, expense.date);
  await syncHouseholdBudgetsForUser(userId, expense.date);
  return expense;
}

function buildExpenseWhere(userId: string, query: ListExpensesQuery): Prisma.ExpenseWhereInput {
  const where: Prisma.ExpenseWhereInput = { userId, deletedAt: null };
  if (query.categoryId) where.categoryId = query.categoryId;
  if (query.from || query.to) {
    where.date = {
      ...(query.from ? { gte: query.from } : {}),
      ...(query.to ? { lte: query.to } : {}),
    };
  }
  return where;
}

export function listExpenses(userId: string, query: ListExpensesQuery) {
  return prisma.expense.findMany({
    where: buildExpenseWhere(userId, query),
    orderBy: { date: 'desc' },
  });
}

export function listExpensesForExport(userId: string, query: ListExpensesQuery) {
  return prisma.expense.findMany({
    where: buildExpenseWhere(userId, query),
    include: { category: { select: { name: true } } },
    orderBy: { date: 'desc' },
  });
}

export async function getExpense(userId: string, id: string) {
  const expense = await prisma.expense.findFirst({
    where: { id, userId, deletedAt: null },
  });
  if (!expense) {
    throw new HttpError(404, 'Expense not found');
  }
  return expense;
}

export async function updateExpense(userId: string, id: string, input: UpdateExpenseInput) {
  const existing = await getExpense(userId, id);
  if (input.categoryId) {
    await getOwnedCategoryOrThrow(userId, input.categoryId);
  }
  const updated = await prisma.expense.update({
    where: { id },
    data: input,
  });

  // Re-check thresholds for both the old and new category/period in case either changed.
  await syncBudgetThresholds(userId, existing.categoryId, existing.date);
  await syncHouseholdBudgetsForUser(userId, existing.date);
  if (updated.categoryId !== existing.categoryId || updated.date.getTime() !== existing.date.getTime()) {
    await syncBudgetThresholds(userId, updated.categoryId, updated.date);
    await syncHouseholdBudgetsForUser(userId, updated.date);
  }

  return updated;
}

export async function deleteExpense(userId: string, id: string): Promise<void> {
  const existing = await getExpense(userId, id);
  await prisma.expense.update({
    where: { id },
    data: { deletedAt: new Date() },
  });
  await syncBudgetThresholds(userId, existing.categoryId, existing.date);
  await syncHouseholdBudgetsForUser(userId, existing.date);
}
