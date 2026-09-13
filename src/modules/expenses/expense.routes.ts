import { Router } from 'express';

import { asyncHandler } from '../../lib/asyncHandler';
import { prisma } from '../../prisma';
import * as expenseService from './expense.service';
import { buildPeriodLabel, expensesToCsv, expensesToPdfBuffer } from './expense.export';
import {
  createExpenseSchema,
  exportExpensesQuerySchema,
  listExpensesQuerySchema,
  updateExpenseSchema,
} from './expense.schemas';

export const expenseRouter = Router();

expenseRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const input = createExpenseSchema.parse(req.body);
    const expense = await expenseService.createExpense(req.userId!, input);
    res.status(201).json(expense);
  }),
);

expenseRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const query = listExpensesQuerySchema.parse(req.query);
    const { expenses, total, page, limit } = await expenseService.listExpenses(req.userId!, query);
    res.setHeader('X-Total-Count', String(total));
    res.setHeader('X-Page', String(page));
    res.setHeader('X-Limit', String(limit));
    res.status(200).json(expenses);
  }),
);

expenseRouter.get(
  '/export',
  asyncHandler(async (req, res) => {
    const { format, ...listQuery } = exportExpensesQuerySchema.parse(req.query);
    const [expenses, user] = await Promise.all([
      expenseService.listExpensesForExport(req.userId!, listQuery),
      prisma.user.findUniqueOrThrow({
        where: { id: req.userId! },
        select: { firstName: true, lastName: true, currency: true },
      }),
    ]);

    const meta = {
      appName: 'Personal Tracker',
      preparedFor: `${user.firstName} ${user.lastName}`,
      periodLabel: buildPeriodLabel(listQuery.from, listQuery.to, expenses),
      currency: user.currency,
    };

    if (format === 'pdf') {
      const buffer = await expensesToPdfBuffer(expenses, meta);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', 'attachment; filename="expenses.pdf"');
      res.status(200).send(buffer);
      return;
    }

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="expenses.csv"');
    res.status(200).send(expensesToCsv(expenses, meta));
  }),
);

expenseRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const expense = await expenseService.getExpense(req.userId!, req.params.id);
    res.status(200).json(expense);
  }),
);

expenseRouter.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const input = updateExpenseSchema.parse(req.body);
    const expense = await expenseService.updateExpense(req.userId!, req.params.id, input);
    res.status(200).json(expense);
  }),
);

expenseRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    await expenseService.deleteExpense(req.userId!, req.params.id);
    res.status(204).send();
  }),
);
