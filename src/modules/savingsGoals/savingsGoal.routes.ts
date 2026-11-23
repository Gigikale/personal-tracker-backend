import { Router } from 'express';

import { asyncHandler } from '../../lib/asyncHandler';
import * as savingsGoalService from './savingsGoal.service';
import {
  contributeSavingsGoalSchema,
  createSavingsGoalSchema,
  updateContributionSchema,
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

savingsGoalRouter.get(
  '/:id/contributions',
  asyncHandler(async (req, res) => {
    const contributions = await savingsGoalService.listSavingsContributions(req.userId!, req.params.id);
    res.status(200).json(contributions);
  }),
);

savingsGoalRouter.patch(
  '/:id/contributions/:contributionId',
  asyncHandler(async (req, res) => {
    const input = updateContributionSchema.parse(req.body);
    const contribution = await savingsGoalService.updateContribution(
      req.userId!,
      req.params.id,
      req.params.contributionId,
      input,
    );
    res.status(200).json(contribution);
  }),
);

savingsGoalRouter.delete(
  '/:id/contributions/:contributionId',
  asyncHandler(async (req, res) => {
    await savingsGoalService.deleteContribution(req.userId!, req.params.id, req.params.contributionId);
    res.status(204).send();
  }),
);

savingsGoalRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    await savingsGoalService.deleteSavingsGoal(req.userId!, req.params.id);
    res.status(204).send();
  }),
);
