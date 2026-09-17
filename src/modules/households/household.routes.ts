import { Router } from 'express';

import { asyncHandler } from '../../lib/asyncHandler';
import { householdInviteRateLimiter } from '../../middleware/rateLimit';
import * as householdService from './household.service';
import {
  addHouseholdMemberSchema,
  createHouseholdBudgetSchema,
  createHouseholdSchema,
  householdBudgetSummaryQuerySchema,
  updateHouseholdBudgetSchema,
  updateHouseholdSchema,
} from './household.schemas';

export const householdRouter = Router();

householdRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const input = createHouseholdSchema.parse(req.body);
    const household = await householdService.createHousehold(req.userId!, input);
    res.status(201).json(household);
  }),
);

householdRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const households = await householdService.listHouseholds(req.userId!);
    res.status(200).json(households);
  }),
);

householdRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const household = await householdService.getHousehold(req.userId!, req.params.id);
    res.status(200).json(household);
  }),
);

householdRouter.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const input = updateHouseholdSchema.parse(req.body);
    const household = await householdService.updateHousehold(req.userId!, req.params.id, input);
    res.status(200).json(household);
  }),
);

householdRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    await householdService.deleteHousehold(req.userId!, req.params.id);
    res.status(204).send();
  }),
);

householdRouter.post(
  '/:id/members',
  householdInviteRateLimiter,
  asyncHandler(async (req, res) => {
    const input = addHouseholdMemberSchema.parse(req.body);
    const household = await householdService.addMember(req.userId!, req.params.id, input);
    res.status(201).json(household);
  }),
);

householdRouter.delete(
  '/:id/members/:userId',
  asyncHandler(async (req, res) => {
    await householdService.removeMember(req.userId!, req.params.id, req.params.userId);
    res.status(204).send();
  }),
);

householdRouter.post(
  '/:id/budgets',
  asyncHandler(async (req, res) => {
    const input = createHouseholdBudgetSchema.parse(req.body);
    const budget = await householdService.createHouseholdBudget(req.userId!, req.params.id, input);
    res.status(201).json(budget);
  }),
);

householdRouter.get(
  '/:id/budgets',
  asyncHandler(async (req, res) => {
    const budgets = await householdService.listHouseholdBudgets(req.userId!, req.params.id);
    res.status(200).json(budgets);
  }),
);

householdRouter.get(
  '/:id/budgets/summary',
  asyncHandler(async (req, res) => {
    const query = householdBudgetSummaryQuerySchema.parse(req.query);
    const summary = await householdService.getHouseholdBudgetSummary(req.userId!, req.params.id, query);
    res.status(200).json(summary);
  }),
);

householdRouter.patch(
  '/:id/budgets/:budgetId',
  asyncHandler(async (req, res) => {
    const input = updateHouseholdBudgetSchema.parse(req.body);
    const budget = await householdService.updateHouseholdBudget(
      req.userId!,
      req.params.id,
      req.params.budgetId,
      input,
    );
    res.status(200).json(budget);
  }),
);

householdRouter.delete(
  '/:id/budgets/:budgetId',
  asyncHandler(async (req, res) => {
    await householdService.deleteHouseholdBudget(req.userId!, req.params.id, req.params.budgetId);
    res.status(204).send();
  }),
);
