import { Router } from 'express';

import { asyncHandler } from '../../lib/asyncHandler';
import * as userService from './user.service';
import { updateMeSchema } from './user.schemas';

export const userRouter = Router();

userRouter.get(
  '/me',
  asyncHandler(async (req, res) => {
    const user = await userService.getMe(req.userId!);
    res.status(200).json(user);
  }),
);

userRouter.patch(
  '/me',
  asyncHandler(async (req, res) => {
    const input = updateMeSchema.parse(req.body);
    const user = await userService.updateMe(req.userId!, input);
    res.status(200).json(user);
  }),
);
