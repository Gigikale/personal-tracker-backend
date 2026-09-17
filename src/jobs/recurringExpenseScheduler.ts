import cron from 'node-cron';
import type { RecurrenceFrequency } from '@prisma/client';

import { prisma } from '../prisma';
import { formatMoney } from '../lib/currency';
import { logger } from '../lib/logger';
import { syncBudgetThresholds } from '../modules/budgets/budget.service';
import { syncHouseholdBudgetsForUser } from '../modules/households/household.service';
import { createNotification } from '../modules/notifications/notification.service';

const MAX_CATCH_UP_ITERATIONS = 500;

function addFrequency(date: Date, frequency: RecurrenceFrequency): Date {
  const y = date.getUTCFullYear();
  const mo = date.getUTCMonth();
  const d = date.getUTCDate();
  const h = date.getUTCHours();
  const mi = date.getUTCMinutes();
  const s = date.getUTCSeconds();

  switch (frequency) {
    case 'DAILY':
      return new Date(Date.UTC(y, mo, d + 1, h, mi, s));
    case 'WEEKLY':
      return new Date(Date.UTC(y, mo, d + 7, h, mi, s));
    case 'MONTHLY':
      return new Date(Date.UTC(y, mo + 1, d, h, mi, s));
    case 'YEARLY':
      return new Date(Date.UTC(y + 1, mo, d, h, mi, s));
  }
}

export async function runRecurringExpenseSweep(): Promise<void> {
  const now = new Date();
  const due = await prisma.recurringExpense.findMany({
    where: { isActive: true, deletedAt: null, nextRunDate: { lte: now } },
    include: { user: { select: { currency: true } } },
  });

  for (const recurring of due) {
    let currentRunDate = recurring.nextRunDate;
    let iterations = 0;

    while (currentRunDate <= now && iterations < MAX_CATCH_UP_ITERATIONS) {
      const nextRunDate = addFrequency(currentRunDate, recurring.frequency);
      const stillActive = !(recurring.endDate && nextRunDate > recurring.endDate);

      // Claim this occurrence by advancing nextRunDate atomically, guarded on it still
      // matching what we read. If a concurrent sweep (e.g. an overlapping boot + cron tick)
      // already claimed it, the guard fails and we stop instead of creating a duplicate expense.
      const claim = await prisma.recurringExpense.updateMany({
        where: { id: recurring.id, nextRunDate: currentRunDate, isActive: true, deletedAt: null },
        data: { nextRunDate, isActive: stillActive },
      });
      if (claim.count === 0) break;

      const expense = await prisma.expense.create({
        data: {
          userId: recurring.userId,
          categoryId: recurring.categoryId,
          amount: recurring.amount,
          description: recurring.description,
          date: currentRunDate,
          recurringExpenseId: recurring.id,
        },
      });

      await syncBudgetThresholds(recurring.userId, expense.categoryId, expense.date);
      await syncHouseholdBudgetsForUser(recurring.userId, expense.date);
      await createNotification(recurring.userId, {
        type: 'RECURRING_EXPENSE',
        title: `${recurring.description ?? 'Recurring expense'} added`,
        message: `A ${recurring.frequency.toLowerCase()} expense of ${formatMoney(Number(recurring.amount), recurring.user.currency)} was automatically added.`,
        metadata: { recurringExpenseId: recurring.id, expenseId: expense.id },
      });

      currentRunDate = nextRunDate;
      if (!stillActive) break;
      iterations++;
    }
  }
}

export function startRecurringExpenseScheduler(): void {
  cron.schedule('0 * * * *', () => {
    runRecurringExpenseSweep().catch((err) => logger.error({ err }, 'Recurring expense sweep failed'));
  });

  // Catch up on anything due immediately on boot, rather than waiting for the next hour mark.
  runRecurringExpenseSweep().catch((err) => logger.error({ err }, 'Recurring expense sweep failed'));
}
