import cron from 'node-cron';
import type { RecurrenceFrequency } from '@prisma/client';

import { prisma } from '../prisma';
import { formatMoney } from '../lib/currency';
import { logger } from '../lib/logger';
import { syncBudgetThresholds } from '../modules/budgets/budget.service';
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
    let nextRunDate = recurring.nextRunDate;
    let isActive = recurring.isActive;
    let iterations = 0;

    while (nextRunDate <= now && isActive && iterations < MAX_CATCH_UP_ITERATIONS) {
      const expense = await prisma.expense.create({
        data: {
          userId: recurring.userId,
          categoryId: recurring.categoryId,
          amount: recurring.amount,
          description: recurring.description,
          date: nextRunDate,
          recurringExpenseId: recurring.id,
        },
      });

      await syncBudgetThresholds(recurring.userId, expense.categoryId, expense.date);
      await createNotification(recurring.userId, {
        type: 'RECURRING_EXPENSE',
        title: `${recurring.description ?? 'Recurring expense'} added`,
        message: `A ${recurring.frequency.toLowerCase()} expense of ${formatMoney(Number(recurring.amount), recurring.user.currency)} was automatically added.`,
        metadata: { recurringExpenseId: recurring.id, expenseId: expense.id },
      });

      nextRunDate = addFrequency(nextRunDate, recurring.frequency);
      if (recurring.endDate && nextRunDate > recurring.endDate) {
        isActive = false;
      }
      iterations++;
    }

    await prisma.recurringExpense.update({
      where: { id: recurring.id },
      data: { nextRunDate, isActive },
    });
  }
}

export function startRecurringExpenseScheduler(): void {
  cron.schedule('0 * * * *', () => {
    runRecurringExpenseSweep().catch((err) => logger.error({ err }, 'Recurring expense sweep failed'));
  });

  // Catch up on anything due immediately on boot, rather than waiting for the next hour mark.
  runRecurringExpenseSweep().catch((err) => logger.error({ err }, 'Recurring expense sweep failed'));
}
