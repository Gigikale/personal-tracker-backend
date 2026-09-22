import { Router } from 'express';

import { asyncHandler } from '../../lib/asyncHandler';
import * as budgetService from './budget.service';
import {
  budgetSummaryQuerySchema,
  budgetTrendQuerySchema,
  createBudgetSchema,
  listBudgetsQuerySchema,
  updateBudgetSchema,
} from './budget.schemas';

export const budgetRouter = Router();

budgetRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const input = createBudgetSchema.parse(req.body);
    const budget = await budgetService.createBudget(req.userId!, input);
    res.status(201).json(budget);
  }),
);

budgetRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const query = listBudgetsQuerySchema.parse(req.query);
    const budgets = await budgetService.listBudgets(req.userId!, query);
    res.status(200).json(budgets);
  }),
);

budgetRouter.get(
  '/summary',
  asyncHandler(async (req, res) => {
    const query = budgetSummaryQuerySchema.parse(req.query);
    const summary = await budgetService.getBudgetSummary(req.userId!, query);
    res.status(200).json(summary);
  }),
);

budgetRouter.get(
  '/trend',
  asyncHandler(async (req, res) => {
    const query = budgetTrendQuerySchema.parse(req.query);
    const trend = await budgetService.getBudgetTrend(req.userId!, query);
    res.status(200).json(trend);
  }),
);

budgetRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const budget = await budgetService.getBudget(req.userId!, req.params.id);
    res.status(200).json(budget);
  }),
);

budgetRouter.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const input = updateBudgetSchema.parse(req.body);
    const budget = await budgetService.updateBudget(req.userId!, req.params.id, input);
    res.status(200).json(budget);
  }),
);

budgetRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    await budgetService.deleteBudget(req.userId!, req.params.id);
    res.status(204).send();
  }),
);
