import { z } from 'zod';

export const signupSchema = z.object({
  firstName: z.string().trim().min(1, 'First name is required').max(100, 'First name is too long'),
  lastName: z.string().trim().min(1, 'Last name is required').max(100, 'Last name is too long'),
  phoneNumber: z
    .string()
    .trim()
    .min(7, 'Enter a valid phone number')
    .max(20, 'Enter a valid phone number')
    .regex(/^\+?[0-9 ()-]+$/, 'Enter a valid phone number'),
  email: z.string().trim().email('Enter a valid email').max(254, 'Email is too long'),
  password: z.string().min(6, 'Use at least 6 characters').max(128, 'Use at most 128 characters'),
});

export const loginSchema = z.object({
  email: z.string().trim().email('Enter a valid email').max(254, 'Email is too long'),
  password: z.string().min(1, 'Password is required').max(128, 'Use at most 128 characters'),
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token is required').max(1000, 'Invalid refresh token'),
});

export type SignupInput = z.infer<typeof signupSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type RefreshInput = z.infer<typeof refreshSchema>;
