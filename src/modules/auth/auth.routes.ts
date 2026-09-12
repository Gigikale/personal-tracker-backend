import { Router } from 'express';

import { asyncHandler } from '../../lib/asyncHandler';
import { loginRateLimiter, signupRateLimiter } from '../../middleware/rateLimit';
import * as authService from './auth.service';
import { loginSchema, refreshSchema, signupSchema } from './auth.schemas';

export const authRouter = Router();

authRouter.post(
  '/signup',
  signupRateLimiter,
  asyncHandler(async (req, res) => {
    const input = signupSchema.parse(req.body);
    const result = await authService.signup(input);
    res.status(201).json(result);
  }),
);

authRouter.post(
  '/login',
  loginRateLimiter,
  asyncHandler(async (req, res) => {
    const input = loginSchema.parse(req.body);
    const result = await authService.login(input);
    res.status(200).json(result);
  }),
);

authRouter.post(
  '/refresh',
  asyncHandler(async (req, res) => {
    const { refreshToken } = refreshSchema.parse(req.body);
    const tokens = await authService.refresh(refreshToken);
    res.status(200).json(tokens);
  }),
);

authRouter.post(
  '/logout',
  asyncHandler(async (req, res) => {
    const { refreshToken } = refreshSchema.parse(req.body);
    await authService.logout(refreshToken);
    res.status(204).send();
  }),
);
