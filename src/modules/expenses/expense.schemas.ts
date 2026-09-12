import { z } from 'zod';

export const createExpenseSchema = z.object({
  categoryId: z.string().uuid('Invalid category'),
  amount: z.coerce.number().positive('Amount must be greater than 0'),
  description: z.string().trim().min(1).optional(),
  date: z.coerce.date(),
});

export const updateExpenseSchema = createExpenseSchema.partial();

export const listExpensesQuerySchema = z.object({
  categoryId: z.string().uuid().optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

export const exportExpensesQuerySchema = listExpensesQuerySchema.extend({
  format: z.enum(['csv', 'pdf']).default('csv'),
});

export type CreateExpenseInput = z.infer<typeof createExpenseSchema>;
export type UpdateExpenseInput = z.infer<typeof updateExpenseSchema>;
export type ListExpensesQuery = z.infer<typeof listExpensesQuerySchema>;
export type ExportExpensesQuery = z.infer<typeof exportExpensesQuerySchema>;
