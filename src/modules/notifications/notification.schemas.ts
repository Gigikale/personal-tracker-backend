import { z } from 'zod';

const notificationTypeEnum = z.enum(['BUDGET_THRESHOLD', 'RECURRING_EXPENSE', 'SYSTEM']);

export const createNotificationSchema = z.object({
  type: notificationTypeEnum,
  title: z.string().trim().min(1, 'Title is required').max(200, 'Title is too long'),
  message: z.string().trim().min(1, 'Message is required').max(1000, 'Message is too long'),
  metadata: z.record(z.any()).optional(),
});

export const listNotificationsQuerySchema = z.object({
  unreadOnly: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v === 'true'),
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});

export type CreateNotificationInput = z.infer<typeof createNotificationSchema>;
export type ListNotificationsQuery = z.infer<typeof listNotificationsQuerySchema>;
