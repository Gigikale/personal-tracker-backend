import { z } from 'zod';

export const createBudgetSchema = z.object({
  categoryId: z.string().uuid().nullable().optional(),
  amount: z.coerce.number().positive('Amount must be greater than 0'),
  month: z.coerce.number().int().min(1).max(12),
  year: z.coerce.number().int().min(2000).max(2100),
});

export const updateBudgetSchema = z.object({
  amount: z.coerce.number().positive('Amount must be greater than 0').optional(),
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
