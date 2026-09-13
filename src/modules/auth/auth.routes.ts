import { Router } from 'express';

import { env } from '../../config/env';
import { asyncHandler } from '../../lib/asyncHandler';
import { HttpError } from '../../lib/errors';
import { buildGoogleAuthUrl, exchangeCodeForGoogleProfile } from '../../lib/googleOAuth';
import {
  loginRateLimiter,
  logoutRateLimiter,
  passwordResetRateLimiter,
  refreshRateLimiter,
  signupRateLimiter,
} from '../../middleware/rateLimit';
import * as authService from './auth.service';
import { forgotPasswordSchema, loginSchema, refreshSchema, resetPasswordSchema, signupSchema } from './auth.schemas';

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
  refreshRateLimiter,
  asyncHandler(async (req, res) => {
    const { refreshToken } = refreshSchema.parse(req.body);
    const tokens = await authService.refresh(refreshToken);
    res.status(200).json(tokens);
  }),
);

authRouter.post(
  '/logout',
  logoutRateLimiter,
  asyncHandler(async (req, res) => {
    const { refreshToken } = refreshSchema.parse(req.body);
    await authService.logout(refreshToken);
    res.status(204).send();
  }),
);

authRouter.post(
  '/forgot-password',
  passwordResetRateLimiter,
  asyncHandler(async (req, res) => {
    const input = forgotPasswordSchema.parse(req.body);
    await authService.requestPasswordReset(input);
    res.status(204).send();
  }),
);

authRouter.post(
  '/reset-password',
  passwordResetRateLimiter,
  asyncHandler(async (req, res) => {
    const input = resetPasswordSchema.parse(req.body);
    await authService.resetPassword(input);
    res.status(204).send();
  }),
);

authRouter.get(
  '/google',
  asyncHandler(async (_req, res) => {
    if (!env.googleClientId || !env.googleClientSecret) {
      throw new HttpError(503, 'Google sign-in is not configured');
    }
    res.redirect(buildGoogleAuthUrl());
  }),
);

authRouter.get(
  '/google/callback',
  asyncHandler(async (req, res) => {
    const code = typeof req.query.code === 'string' ? req.query.code : null;
    if (!code) {
      res.redirect(`${env.frontendUrl}/login?error=oauth_failed`);
      return;
    }

    try {
      const profile = await exchangeCodeForGoogleProfile(code);
      const tokens = await authService.loginWithGoogle(profile);
      const params = new URLSearchParams({ accessToken: tokens.accessToken, refreshToken: tokens.refreshToken });
      res.redirect(`${env.frontendUrl}/auth/callback#${params.toString()}`);
    } catch {
      res.redirect(`${env.frontendUrl}/login?error=oauth_failed`);
    }
  }),
);
