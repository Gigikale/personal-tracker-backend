import { Router } from 'express';

import { asyncHandler } from '../../lib/asyncHandler';
import * as notificationService from './notification.service';
import { createNotificationSchema, listNotificationsQuerySchema } from './notification.schemas';

export const notificationRouter = Router();

notificationRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const input = createNotificationSchema.parse(req.body);
    const notification = await notificationService.createNotification(req.userId!, input);
    res.status(201).json(notification);
  }),
);

notificationRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const query = listNotificationsQuerySchema.parse(req.query);
    const { notifications, total, page, limit } = await notificationService.listNotifications(req.userId!, query);
    res.setHeader('X-Total-Count', String(total));
    res.setHeader('X-Page', String(page));
    res.setHeader('X-Limit', String(limit));
    res.status(200).json(notifications);
  }),
);

notificationRouter.patch(
  '/read-all',
  asyncHandler(async (req, res) => {
    await notificationService.markAllAsRead(req.userId!);
    res.status(204).send();
  }),
);

notificationRouter.patch(
  '/:id/read',
  asyncHandler(async (req, res) => {
    const notification = await notificationService.markAsRead(req.userId!, req.params.id);
    res.status(200).json(notification);
  }),
);

notificationRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    await notificationService.deleteNotification(req.userId!, req.params.id);
    res.status(204).send();
  }),
);
