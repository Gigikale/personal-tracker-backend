import { prisma } from '../../prisma';
import { HttpError } from '../../lib/errors';
import { getOwnedCategoryOrThrow } from '../categories/category.service';
import type { CreateRecurringExpenseInput, UpdateRecurringExpenseInput } from './recurringExpense.schemas';

export async function createRecurringExpense(userId: string, input: CreateRecurringExpenseInput) {
  await getOwnedCategoryOrThrow(userId, input.categoryId);
  return prisma.recurringExpense.create({
    data: { userId, ...input, nextRunDate: input.startDate },
  });
}

export function listRecurringExpenses(userId: string) {
  return prisma.recurringExpense.findMany({
    where: { userId, deletedAt: null },
    orderBy: { nextRunDate: 'asc' },
  });
}

export async function getRecurringExpense(userId: string, id: string) {
  const recurringExpense = await prisma.recurringExpense.findFirst({
    where: { id, userId, deletedAt: null },
  });
  if (!recurringExpense) {
    throw new HttpError(404, 'Recurring expense not found');
  }
  return recurringExpense;
}

export async function updateRecurringExpense(userId: string, id: string, input: UpdateRecurringExpenseInput) {
  await getRecurringExpense(userId, id);
  if (input.categoryId) {
    await getOwnedCategoryOrThrow(userId, input.categoryId);
  }
  return prisma.recurringExpense.update({
    where: { id },
    data: input,
  });
}

export async function deleteRecurringExpense(userId: string, id: string): Promise<void> {
  await getRecurringExpense(userId, id);
  await prisma.recurringExpense.update({
    where: { id },
    data: { deletedAt: new Date() },
  });
}
