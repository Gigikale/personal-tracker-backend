import { z } from 'zod';

export const createSavingsGoalSchema = z.object({
  name: z.string().trim().min(1, 'Name is required'),
  targetAmount: z.coerce.number().positive('Target amount must be greater than 0'),
  targetDate: z.coerce.date().optional(),
});

export const updateSavingsGoalSchema = z.object({
  name: z.string().trim().min(1).optional(),
  targetAmount: z.coerce.number().positive('Target amount must be greater than 0').optional(),
  targetDate: z.coerce.date().nullable().optional(),
});

export const contributeSavingsGoalSchema = z.object({
  amount: z.coerce.number().refine((v) => v !== 0, 'Amount must not be zero'),
});

export type CreateSavingsGoalInput = z.infer<typeof createSavingsGoalSchema>;
export type UpdateSavingsGoalInput = z.infer<typeof updateSavingsGoalSchema>;
export type ContributeSavingsGoalInput = z.infer<typeof contributeSavingsGoalSchema>;
