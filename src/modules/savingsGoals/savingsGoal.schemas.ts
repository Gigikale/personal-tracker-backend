import { z } from 'zod';

const targetAmount = z.coerce
  .number()
  .positive('Target amount must be greater than 0')
  .max(999999999.99, 'Target amount is too large');

export const createSavingsGoalSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(100, 'Name is too long'),
  targetAmount,
  targetDate: z.coerce.date().optional(),
});

export const updateSavingsGoalSchema = z.object({
  name: z.string().trim().min(1).max(100, 'Name is too long').optional(),
  targetAmount: targetAmount.optional(),
  targetDate: z.coerce.date().nullable().optional(),
});

const contributionNote = z.string().trim().min(1).max(200, 'Note is too long');

export const contributeSavingsGoalSchema = z.object({
  amount: z.coerce
    .number()
    .refine((v) => v !== 0, 'Amount must not be zero')
    .refine((v) => Math.abs(v) <= 999999999.99, 'Amount is too large'),
  note: contributionNote.optional(),
  // A day of slack so a date picked as "today" in a timezone ahead of UTC isn't rejected.
  contributedAt: z.coerce
    .date()
    .refine((d) => d.getTime() <= Date.now() + 24 * 60 * 60 * 1000, 'Date cannot be in the future')
    .optional(),
});

export const updateContributionSchema = contributeSavingsGoalSchema.partial().extend({
  note: contributionNote.nullable().optional(),
});

export type CreateSavingsGoalInput = z.infer<typeof createSavingsGoalSchema>;
export type UpdateSavingsGoalInput = z.infer<typeof updateSavingsGoalSchema>;
export type ContributeSavingsGoalInput = z.infer<typeof contributeSavingsGoalSchema>;
export type UpdateContributionInput = z.infer<typeof updateContributionSchema>;
