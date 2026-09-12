import rateLimit from 'express-rate-limit';

const skipInTests = () => process.env.NODE_ENV === 'test';

export const loginRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipInTests,
  message: { message: 'Too many login attempts. Try again later.' },
});

export const signupRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipInTests,
  message: { message: 'Too many signup attempts. Try again later.' },
});
