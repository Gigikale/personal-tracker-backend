import { Prisma } from '@prisma/client';

import { prisma } from '../../prisma';
import { HttpError } from '../../lib/errors';
import type {
  ContributeSavingsGoalInput,
  CreateSavingsGoalInput,
  UpdateContributionInput,
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

  await prisma.$transaction(async (tx) => {
    // Guard and increment in one atomic statement so two concurrent contributions can't both
    // read the same starting balance and have one silently overwrite the other.
    const minRequired = input.amount < 0 ? -input.amount : 0;
    const result = await tx.savingsGoal.updateMany({
      where: { id, userId, deletedAt: null, currentAmount: { gte: minRequired } },
      data: { currentAmount: { increment: input.amount } },
    });

    if (result.count === 0) {
      throw new HttpError(400, 'This would take the savings goal balance below 0');
    }

    await tx.savingsContribution.create({
      data: {
        goalId: id,
        amount: input.amount,
        note: input.note ?? null,
        contributedAt: input.contributedAt,
      },
    });
  });

  return getSavingsGoal(userId, id);
}

export async function listSavingsContributions(userId: string, id: string) {
  await getSavingsGoal(userId, id);
  return prisma.savingsContribution.findMany({
    where: { goalId: id },
    orderBy: [{ contributedAt: 'desc' }, { createdAt: 'desc' }],
  });
}

async function getContribution(userId: string, goalId: string, contributionId: string) {
  await getSavingsGoal(userId, goalId);
  const contribution = await prisma.savingsContribution.findFirst({
    where: { id: contributionId, goalId },
  });
  if (!contribution) {
    throw new HttpError(404, 'Contribution not found');
  }
  return contribution;
}

// Applies `delta` to the goal balance and then runs `change` on the contribution, all or nothing.
// `change` must match the contribution's amount as read, so a concurrent edit can't be counted twice.
async function adjustGoalForContribution(
  userId: string,
  goalId: string,
  delta: Prisma.Decimal,
  change: (tx: Prisma.TransactionClient) => Promise<{ count: number }>,
) {
  await prisma.$transaction(async (tx) => {
    const minRequired = delta.isNegative() ? delta.negated() : 0;
    const result = await tx.savingsGoal.updateMany({
      where: { id: goalId, userId, deletedAt: null, currentAmount: { gte: minRequired } },
      data: { currentAmount: { increment: delta } },
    });
    if (result.count === 0) {
      throw new HttpError(400, 'This would take the savings goal balance below 0');
    }

    const changed = await change(tx);
    if (changed.count === 0) {
      throw new HttpError(409, 'This entry was changed by another request. Reload and try again.');
    }
  });
}

export async function updateContribution(
  userId: string,
  goalId: string,
  contributionId: string,
  input: UpdateContributionInput,
) {
  const existing = await getContribution(userId, goalId, contributionId);
  const delta =
    input.amount === undefined
      ? new Prisma.Decimal(0)
      : new Prisma.Decimal(input.amount).minus(existing.amount);

  await adjustGoalForContribution(userId, goalId, delta, (tx) =>
    tx.savingsContribution.updateMany({
      where: { id: contributionId, goalId, amount: existing.amount },
      data: input,
    }),
  );

  return getContribution(userId, goalId, contributionId);
}

export async function deleteContribution(
  userId: string,
  goalId: string,
  contributionId: string,
): Promise<void> {
  const existing = await getContribution(userId, goalId, contributionId);

  await adjustGoalForContribution(userId, goalId, existing.amount.negated(), (tx) =>
    tx.savingsContribution.deleteMany({
      where: { id: contributionId, goalId, amount: existing.amount },
    }),
  );
}
