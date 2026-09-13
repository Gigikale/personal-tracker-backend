import { z } from 'zod';

const frequencyEnum = z.enum(['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY']);

const recurringAmount = z.coerce.number().positive('Amount must be greater than 0').max(999999999.99, 'Amount is too large');
const description = z.string().trim().min(1).max(500, 'Description is too long');

export const createRecurringExpenseSchema = z.object({
  categoryId: z.string().uuid('Invalid category'),
  amount: recurringAmount,
  description: description.optional(),
  frequency: frequencyEnum,
  startDate: z.coerce.date(),
  endDate: z.coerce.date().optional(),
});

export const updateRecurringExpenseSchema = z.object({
  categoryId: z.string().uuid('Invalid category').optional(),
  amount: recurringAmount.optional(),
  description: description.optional(),
  frequency: frequencyEnum.optional(),
  endDate: z.coerce.date().nullable().optional(),
  isActive: z.boolean().optional(),
});

export type CreateRecurringExpenseInput = z.infer<typeof createRecurringExpenseSchema>;
export type UpdateRecurringExpenseInput = z.infer<typeof updateRecurringExpenseSchema>;
