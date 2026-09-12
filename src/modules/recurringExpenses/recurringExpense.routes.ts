import { Router } from 'express';

import { asyncHandler } from '../../lib/asyncHandler';
import * as recurringExpenseService from './recurringExpense.service';
import { createRecurringExpenseSchema, updateRecurringExpenseSchema } from './recurringExpense.schemas';

export const recurringExpenseRouter = Router();

recurringExpenseRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const input = createRecurringExpenseSchema.parse(req.body);
    const recurringExpense = await recurringExpenseService.createRecurringExpense(req.userId!, input);
    res.status(201).json(recurringExpense);
  }),
);

recurringExpenseRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const recurringExpenses = await recurringExpenseService.listRecurringExpenses(req.userId!);
    res.status(200).json(recurringExpenses);
  }),
);

recurringExpenseRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const recurringExpense = await recurringExpenseService.getRecurringExpense(req.userId!, req.params.id);
    res.status(200).json(recurringExpense);
  }),
);

recurringExpenseRouter.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const input = updateRecurringExpenseSchema.parse(req.body);
    const recurringExpense = await recurringExpenseService.updateRecurringExpense(
      req.userId!,
      req.params.id,
      input,
    );
    res.status(200).json(recurringExpense);
  }),
);

recurringExpenseRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    await recurringExpenseService.deleteRecurringExpense(req.userId!, req.params.id);
    res.status(204).send();
  }),
);
