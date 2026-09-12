import { z } from 'zod';

const frequencyEnum = z.enum(['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY']);

export const createRecurringExpenseSchema = z.object({
  categoryId: z.string().uuid('Invalid category'),
  amount: z.coerce.number().positive('Amount must be greater than 0'),
  description: z.string().trim().min(1).optional(),
  frequency: frequencyEnum,
  startDate: z.coerce.date(),
  endDate: z.coerce.date().optional(),
});

export const updateRecurringExpenseSchema = z.object({
  categoryId: z.string().uuid('Invalid category').optional(),
  amount: z.coerce.number().positive('Amount must be greater than 0').optional(),
  description: z.string().trim().min(1).optional(),
  frequency: frequencyEnum.optional(),
  endDate: z.coerce.date().nullable().optional(),
  isActive: z.boolean().optional(),
});

export type CreateRecurringExpenseInput = z.infer<typeof createRecurringExpenseSchema>;
export type UpdateRecurringExpenseInput = z.infer<typeof updateRecurringExpenseSchema>;
