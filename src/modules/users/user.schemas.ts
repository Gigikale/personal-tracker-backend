import { z } from 'zod';

export const updateMeSchema = z.object({
  currency: z.enum(['USD', 'NGN']),
});

export type UpdateMeInput = z.infer<typeof updateMeSchema>;
