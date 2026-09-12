import { z } from 'zod';

export const createHouseholdSchema = z.object({
  name: z.string().trim().min(1, 'Name is required'),
});

export const updateHouseholdSchema = z.object({
  name: z.string().trim().min(1, 'Name is required'),
});

export const addHouseholdMemberSchema = z.object({
  email: z.string().trim().email('Enter a valid email'),
});

export const createHouseholdBudgetSchema = z.object({
  amount: z.coerce.number().positive('Amount must be greater than 0'),
  month: z.coerce.number().int().min(1).max(12),
  year: z.coerce.number().int().min(2000).max(2100),
});

export const updateHouseholdBudgetSchema = z.object({
  amount: z.coerce.number().positive('Amount must be greater than 0').optional(),
});

export const householdBudgetSummaryQuerySchema = z.object({
  month: z.coerce.number().int().min(1).max(12).optional(),
  year: z.coerce.number().int().min(2000).max(2100).optional(),
});

export type CreateHouseholdInput = z.infer<typeof createHouseholdSchema>;
export type UpdateHouseholdInput = z.infer<typeof updateHouseholdSchema>;
export type AddHouseholdMemberInput = z.infer<typeof addHouseholdMemberSchema>;
export type CreateHouseholdBudgetInput = z.infer<typeof createHouseholdBudgetSchema>;
export type UpdateHouseholdBudgetInput = z.infer<typeof updateHouseholdBudgetSchema>;
export type HouseholdBudgetSummaryQuery = z.infer<typeof householdBudgetSummaryQuerySchema>;
