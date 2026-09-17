import { prisma } from '../../prisma';
import { HttpError } from '../../lib/errors';
import type {
  ContributeSavingsGoalInput,
  CreateSavingsGoalInput,
  UpdateSavingsGoalInput,
} from './savingsGoal.schemas';

export function createSavingsGoal(userId: string, input: CreateSavingsGoalInput) {
  return prisma.savingsGoal.create({
    data: {
      userId,
      name: input.name,
      targetAmount: input.targetAmount,
      targetDate: input.targetDate ?? null,
    },
  });
}

export function listSavingsGoals(userId: string) {
  return prisma.savingsGoal.findMany({
    where: { userId, deletedAt: null },
    orderBy: { createdAt: 'desc' },
  });
}

export async function getSavingsGoal(userId: string, id: string) {
  const goal = await prisma.savingsGoal.findFirst({
    where: { id, userId, deletedAt: null },
  });
  if (!goal) {
    throw new HttpError(404, 'Savings goal not found');
  }
  return goal;
}

export async function updateSavingsGoal(userId: string, id: string, input: UpdateSavingsGoalInput) {
  await getSavingsGoal(userId, id);
  return prisma.savingsGoal.update({
    where: { id },
    data: input,
  });
}

export async function deleteSavingsGoal(userId: string, id: string): Promise<void> {
  await getSavingsGoal(userId, id);
  await prisma.savingsGoal.update({
    where: { id },
    data: { deletedAt: new Date() },
  });
}

export async function contributeToSavingsGoal(userId: string, id: string, input: ContributeSavingsGoalInput) {
  await getSavingsGoal(userId, id);

  // Guard and increment in one atomic statement so two concurrent contributions can't both
  // read the same starting balance and have one silently overwrite the other.
  const minRequired = input.amount < 0 ? -input.amount : 0;
  const result = await prisma.savingsGoal.updateMany({
    where: { id, userId, deletedAt: null, currentAmount: { gte: minRequired } },
    data: { currentAmount: { increment: input.amount } },
  });

  if (result.count === 0) {
    throw new HttpError(400, 'This would take the savings goal balance below 0');
  }

  return getSavingsGoal(userId, id);
}
