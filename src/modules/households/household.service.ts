import { prisma } from '../../prisma';
import { HttpError } from '../../lib/errors';
import { toHttpError } from '../../lib/prismaErrors';
import { formatMoney } from '../../lib/currency';
import { sendHouseholdInviteEmail, sendHouseholdMemberRemovedEmail } from '../../lib/email';
import { createNotification } from '../notifications/notification.service';
import type {
  AddHouseholdMemberInput,
  CreateHouseholdBudgetInput,
  CreateHouseholdInput,
  HouseholdBudgetSummaryQuery,
  UpdateHouseholdBudgetInput,
  UpdateHouseholdInput,
} from './household.schemas';

const THRESHOLDS = [120, 100, 80] as const;
const INVITE_EXPIRY_DAYS = 7;

async function assertMembership(userId: string, householdId: string) {
  const household = await prisma.household.findFirst({
    where: { id: householdId, deletedAt: null, members: { some: { userId } } },
  });
  if (!household) {
    throw new HttpError(404, 'Household not found');
  }
  return household;
}

async function assertOwner(userId: string, householdId: string) {
  const household = await assertMembership(userId, householdId);
  if (household.ownerId !== userId) {
    throw new HttpError(403, 'Only the household owner can do this');
  }
  return household;
}

export async function createHousehold(userId: string, input: CreateHouseholdInput) {
  return prisma.household.create({
    data: {
      name: input.name,
      ownerId: userId,
      members: {
        create: { userId, role: 'OWNER' },
      },
    },
    include: { members: true },
  });
}

export function listHouseholds(userId: string) {
  return prisma.household.findMany({
    where: { deletedAt: null, members: { some: { userId } } },
    include: { members: { include: { user: { select: { id: true, firstName: true, lastName: true, email: true } } } } },
    orderBy: { createdAt: 'desc' },
  });
}

export async function getHousehold(userId: string, householdId: string) {
  await assertMembership(userId, householdId);
  return prisma.household.findUniqueOrThrow({
    where: { id: householdId },
    include: { members: { include: { user: { select: { id: true, firstName: true, lastName: true, email: true } } } } },
  });
}

export async function addMember(userId: string, householdId: string, input: AddHouseholdMemberInput) {
  const household = await assertOwner(userId, householdId);
  const email = input.email;

  const [targetUser, inviter] = await Promise.all([
    prisma.user.findUnique({ where: { email } }),
    prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { firstName: true, lastName: true } }),
  ]);
  const inviterName = `${inviter.firstName} ${inviter.lastName}`;

  if (targetUser) {
    try {
      await prisma.householdMember.create({
        data: { householdId, userId: targetUser.id, role: 'MEMBER' },
      });
    } catch (err) {
      toHttpError(err, 'This user is already a member of the household');
    }

    await createNotification(targetUser.id, {
      type: 'HOUSEHOLD_INVITE',
      title: `Added to "${household.name}"`,
      message: `${inviterName} added you to the household "${household.name}".`,
      metadata: { householdId },
    });
    await sendHouseholdInviteEmail(targetUser.email, { householdName: household.name, inviterName, hasAccount: true });

    return { ...(await getHousehold(userId, householdId)), invitedPending: false };
  }

  // No account with this email yet — hold a pending invite that gets converted into real
  // membership automatically the moment they sign up (see linkPendingHouseholdInvites).
  await prisma.householdInvite.upsert({
    where: { householdId_email: { householdId, email } },
    create: {
      householdId,
      email,
      invitedById: userId,
      expiresAt: new Date(Date.now() + INVITE_EXPIRY_DAYS * 24 * 60 * 60 * 1000),
    },
    update: {
      invitedById: userId,
      expiresAt: new Date(Date.now() + INVITE_EXPIRY_DAYS * 24 * 60 * 60 * 1000),
      acceptedAt: null,
    },
  });
  await sendHouseholdInviteEmail(email, { householdName: household.name, inviterName, hasAccount: false });

  return { ...(await getHousehold(userId, householdId)), invitedPending: true };
}

export async function removeMember(userId: string, householdId: string, targetUserId: string): Promise<void> {
  const household = await assertMembership(userId, householdId);

  const isSelf = targetUserId === userId;
  const isOwner = household.ownerId === userId;
  if (!isSelf && !isOwner) {
    throw new HttpError(403, 'Only the household owner can remove other members');
  }
  if (targetUserId === household.ownerId) {
    throw new HttpError(400, 'The household owner cannot be removed — delete the household instead');
  }

  const removed = await prisma.householdMember.findFirst({
    where: { householdId, userId: targetUserId },
    include: { user: { select: { email: true } } },
  });

  await prisma.householdMember.deleteMany({ where: { householdId, userId: targetUserId } });

  if (removed && !isSelf) {
    await createNotification(targetUserId, {
      type: 'HOUSEHOLD_MEMBER_REMOVED',
      title: `Removed from "${household.name}"`,
      message: `You were removed from the household "${household.name}".`,
      metadata: { householdId },
    });
    await sendHouseholdMemberRemovedEmail(removed.user.email, household.name);
  }
}

export async function updateHousehold(userId: string, householdId: string, input: UpdateHouseholdInput) {
  await assertOwner(userId, householdId);
  return prisma.household.update({
    where: { id: householdId },
    data: { name: input.name },
    include: { members: { include: { user: { select: { id: true, firstName: true, lastName: true, email: true } } } } },
  });
}

export async function deleteHousehold(userId: string, householdId: string): Promise<void> {
  await assertOwner(userId, householdId);
  await prisma.household.update({
    where: { id: householdId },
    data: { deletedAt: new Date() },
  });
}

export async function createHouseholdBudget(
  userId: string,
  householdId: string,
  input: CreateHouseholdBudgetInput,
) {
  await assertMembership(userId, householdId);
  try {
    return await prisma.householdBudget.create({
      data: { householdId, amount: input.amount, month: input.month, year: input.year },
    });
  } catch (err) {
    toHttpError(err, 'A household budget already exists for this period');
  }
}

export async function listHouseholdBudgets(userId: string, householdId: string) {
  await assertMembership(userId, householdId);
  return prisma.householdBudget.findMany({
    where: { householdId, deletedAt: null },
    orderBy: [{ year: 'desc' }, { month: 'desc' }],
  });
}

export async function updateHouseholdBudget(
  userId: string,
  householdId: string,
  budgetId: string,
  input: UpdateHouseholdBudgetInput,
) {
  await assertMembership(userId, householdId);
  const budget = await prisma.householdBudget.findFirst({
    where: { id: budgetId, householdId, deletedAt: null },
  });
  if (!budget) {
    throw new HttpError(404, 'Household budget not found');
  }
  return prisma.householdBudget.update({ where: { id: budgetId }, data: input });
}

export async function deleteHouseholdBudget(userId: string, householdId: string, budgetId: string): Promise<void> {
  await assertMembership(userId, householdId);
  const budget = await prisma.householdBudget.findFirst({
    where: { id: budgetId, householdId, deletedAt: null },
  });
  if (!budget) {
    throw new HttpError(404, 'Household budget not found');
  }
  await prisma.householdBudget.update({ where: { id: budgetId }, data: { deletedAt: new Date() } });
}

export async function getHouseholdBudgetSummary(
  userId: string,
  householdId: string,
  query: HouseholdBudgetSummaryQuery,
) {
  await assertMembership(userId, householdId);

  const now = new Date();
  const month = query.month ?? now.getUTCMonth() + 1;
  const year = query.year ?? now.getUTCFullYear();
  const periodStart = new Date(Date.UTC(year, month - 1, 1));
  const periodEnd = new Date(Date.UTC(year, month, 1));

  const [budget, members] = await Promise.all([
    prisma.householdBudget.findFirst({ where: { householdId, month, year, deletedAt: null } }),
    prisma.householdMember.findMany({
      where: { householdId },
      include: { user: { select: { id: true, firstName: true, lastName: true, currency: true } } },
    }),
  ]);

  const memberUserIds = members.map((m) => m.userId);

  const [totalActual, byMember] = await Promise.all([
    prisma.expense.aggregate({
      where: { userId: { in: memberUserIds }, deletedAt: null, date: { gte: periodStart, lt: periodEnd } },
      _sum: { amount: true },
    }),
    prisma.expense.groupBy({
      by: ['userId'],
      where: { userId: { in: memberUserIds }, deletedAt: null, date: { gte: periodStart, lt: periodEnd } },
      _sum: { amount: true },
    }),
  ]);

  const spentByUserId = new Map(byMember.map((b) => [b.userId, Number(b._sum.amount ?? 0)]));
  const budgetAmount = budget ? Number(budget.amount) : null;
  const actualSpent = Number(totalActual._sum.amount ?? 0);
  const distinctCurrencies = new Set(members.map((m) => m.user.currency));
  const hasMixedCurrencies = distinctCurrencies.size > 1;

  return {
    budgetId: budget?.id ?? null,
    month,
    year,
    budgetAmount,
    actualSpent,
    remaining: budgetAmount !== null ? budgetAmount - actualSpent : null,
    percentUsed: budgetAmount ? Math.round((actualSpent / budgetAmount) * 1000) / 10 : null,
    hasMixedCurrencies,
    byMember: members.map((m) => ({
      userId: m.userId,
      name: `${m.user.firstName} ${m.user.lastName}`,
      currency: m.user.currency,
      spent: spentByUserId.get(m.userId) ?? 0,
    })),
  };
}

async function syncOneHouseholdBudgetThreshold(
  household: { id: string; name: string },
  budget: { id: string; amount: unknown; lastNotifiedThreshold: number | null },
  actualSpent: number,
  memberUserIds: string[],
): Promise<void> {
  const budgetAmount = Number(budget.amount);
  const percentUsed = budgetAmount > 0 ? (actualSpent / budgetAmount) * 100 : 0;
  const crossed = THRESHOLDS.find((t) => percentUsed >= t) ?? null;

  if (crossed === budget.lastNotifiedThreshold) return;

  if ((crossed ?? 0) > (budget.lastNotifiedThreshold ?? 0)) {
    const title = `${crossed}% of "${household.name}" household budget used`;
    const members = await prisma.user.findMany({
      where: { id: { in: memberUserIds } },
      select: { id: true, currency: true },
    });
    await Promise.all(
      members.map((member) =>
        createNotification(member.id, {
          type: 'BUDGET_THRESHOLD',
          title,
          message: `Your household has used ${Math.round(percentUsed)}% of its shared budget for this period (${formatMoney(actualSpent, member.currency)} of ${formatMoney(budgetAmount, member.currency)}).`,
          metadata: { householdId: household.id, householdBudgetId: budget.id, threshold: crossed, percentUsed },
        }),
      ),
    );
  }

  await prisma.householdBudget.update({
    where: { id: budget.id },
    data: { lastNotifiedThreshold: crossed },
  });
}

export async function syncHouseholdBudgetsForUser(userId: string, date: Date): Promise<void> {
  const month = date.getUTCMonth() + 1;
  const year = date.getUTCFullYear();
  const periodStart = new Date(Date.UTC(year, month - 1, 1));
  const periodEnd = new Date(Date.UTC(year, month, 1));

  const memberships = await prisma.householdMember.findMany({
    where: { userId, household: { deletedAt: null } },
    select: { householdId: true },
  });
  if (memberships.length === 0) return;

  for (const { householdId } of memberships) {
    const budget = await prisma.householdBudget.findFirst({
      where: { householdId, month, year, deletedAt: null },
    });
    if (!budget) continue;

    const [household, members] = await Promise.all([
      prisma.household.findUniqueOrThrow({ where: { id: householdId } }),
      prisma.householdMember.findMany({ where: { householdId } }),
    ]);
    const memberUserIds = members.map((m) => m.userId);

    const totalActual = await prisma.expense.aggregate({
      where: { userId: { in: memberUserIds }, deletedAt: null, date: { gte: periodStart, lt: periodEnd } },
      _sum: { amount: true },
    });

    await syncOneHouseholdBudgetThreshold(household, budget, Number(totalActual._sum.amount ?? 0), memberUserIds);
  }
}
