import { Router } from 'express';

import { asyncHandler } from '../../lib/asyncHandler';
import * as savingsGoalService from './savingsGoal.service';
import {
  contributeSavingsGoalSchema,
  createSavingsGoalSchema,
  updateSavingsGoalSchema,
} from './savingsGoal.schemas';

export const savingsGoalRouter = Router();

savingsGoalRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const input = createSavingsGoalSchema.parse(req.body);
    const goal = await savingsGoalService.createSavingsGoal(req.userId!, input);
    res.status(201).json(goal);
  }),
);

savingsGoalRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const goals = await savingsGoalService.listSavingsGoals(req.userId!);
    res.status(200).json(goals);
  }),
);

savingsGoalRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const goal = await savingsGoalService.getSavingsGoal(req.userId!, req.params.id);
    res.status(200).json(goal);
  }),
);

savingsGoalRouter.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const input = updateSavingsGoalSchema.parse(req.body);
    const goal = await savingsGoalService.updateSavingsGoal(req.userId!, req.params.id, input);
    res.status(200).json(goal);
  }),
);

savingsGoalRouter.post(
  '/:id/contribute',
  asyncHandler(async (req, res) => {
    const input = contributeSavingsGoalSchema.parse(req.body);
    const goal = await savingsGoalService.contributeToSavingsGoal(req.userId!, req.params.id, input);
    res.status(200).json(goal);
  }),
);

savingsGoalRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    await savingsGoalService.deleteSavingsGoal(req.userId!, req.params.id);
    res.status(204).send();
  }),
);
