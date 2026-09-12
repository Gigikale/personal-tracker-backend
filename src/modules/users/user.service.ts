import { prisma } from '../../prisma';
import type { UpdateMeInput } from './user.schemas';

const publicUserSelect = {
  id: true,
  email: true,
  firstName: true,
  lastName: true,
  phoneNumber: true,
  currency: true,
} as const;

export function getMe(userId: string) {
  return prisma.user.findUniqueOrThrow({ where: { id: userId }, select: publicUserSelect });
}

export function updateMe(userId: string, input: UpdateMeInput) {
  return prisma.user.update({ where: { id: userId }, data: input, select: publicUserSelect });
}
