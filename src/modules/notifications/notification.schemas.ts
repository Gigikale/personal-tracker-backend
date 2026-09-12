import { z } from 'zod';

const notificationTypeEnum = z.enum(['BUDGET_THRESHOLD', 'RECURRING_EXPENSE', 'SYSTEM']);

export const createNotificationSchema = z.object({
  type: notificationTypeEnum,
  title: z.string().trim().min(1, 'Title is required'),
  message: z.string().trim().min(1, 'Message is required'),
  metadata: z.record(z.any()).optional(),
});

export const listNotificationsQuerySchema = z.object({
  unreadOnly: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v === 'true'),
});

export type CreateNotificationInput = z.infer<typeof createNotificationSchema>;
export type ListNotificationsQuery = z.infer<typeof listNotificationsQuerySchema>;
