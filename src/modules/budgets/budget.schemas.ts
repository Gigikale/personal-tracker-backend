import { z } from 'zod';

const budgetAmount = z.coerce.number().positive('Amount must be greater than 0').max(999999999.99, 'Amount is too large');

export const createBudgetSchema = z.object({
  categoryId: z.string().uuid().nullable().optional(),
  amount: budgetAmount,
  month: z.coerce.number().int().min(1).max(12),
  year: z.coerce.number().int().min(2000).max(2100),
});

export const updateBudgetSchema = z.object({
  amount: budgetAmount.optional(),
});

export const listBudgetsQuerySchema = z.object({
  month: z.coerce.number().int().min(1).max(12).optional(),
  year: z.coerce.number().int().min(2000).max(2100).optional(),
});

export const budgetSummaryQuerySchema = z.object({
  month: z.coerce.number().int().min(1).max(12).optional(),
  year: z.coerce.number().int().min(2000).max(2100).optional(),
});

export type CreateBudgetInput = z.infer<typeof createBudgetSchema>;
export type UpdateBudgetInput = z.infer<typeof updateBudgetSchema>;
export type ListBudgetsQuery = z.infer<typeof listBudgetsQuerySchema>;
export type BudgetSummaryQuery = z.infer<typeof budgetSummaryQuerySchema>;
