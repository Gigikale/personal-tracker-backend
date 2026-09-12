import { prisma } from '../../prisma';
import { HttpError } from '../../lib/errors';
import { pushToUser } from '../../lib/realtime';
import type { CreateNotificationInput, ListNotificationsQuery } from './notification.schemas';

export async function createNotification(userId: string, input: CreateNotificationInput) {
  const notification = await prisma.notification.create({
    data: { userId, ...input },
  });
  pushToUser(userId, 'notification.created', notification);
  return notification;
}

export function listNotifications(userId: string, query: ListNotificationsQuery) {
  return prisma.notification.findMany({
    where: { userId, ...(query.unreadOnly ? { isRead: false } : {}) },
    orderBy: { createdAt: 'desc' },
  });
}

export async function getNotification(userId: string, id: string) {
  const notification = await prisma.notification.findFirst({
    where: { id, userId },
  });
  if (!notification) {
    throw new HttpError(404, 'Notification not found');
  }
  return notification;
}

export async function markAsRead(userId: string, id: string) {
  await getNotification(userId, id);
  return prisma.notification.update({
    where: { id },
    data: { isRead: true },
  });
}

export async function markAllAsRead(userId: string): Promise<void> {
  await prisma.notification.updateMany({
    where: { userId, isRead: false },
    data: { isRead: true },
  });
}

export async function deleteNotification(userId: string, id: string): Promise<void> {
  await getNotification(userId, id);
  await prisma.notification.delete({ where: { id } });
}
