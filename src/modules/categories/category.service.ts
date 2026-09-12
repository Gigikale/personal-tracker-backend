import { prisma } from '../../prisma';
import { HttpError } from '../../lib/errors';
import { toHttpError } from '../../lib/prismaErrors';
import type { CreateCategoryInput, UpdateCategoryInput } from './category.schemas';

export async function getOwnedCategoryOrThrow(userId: string, categoryId: string) {
  const category = await prisma.category.findFirst({
    where: { id: categoryId, userId, deletedAt: null },
  });
  if (!category) {
    throw new HttpError(400, 'Invalid category');
  }
  return category;
}

export async function createCategory(userId: string, input: CreateCategoryInput) {
  try {
    return await prisma.category.create({
      data: { userId, ...input },
    });
  } catch (err) {
    toHttpError(err, 'A category with this name already exists');
  }
}

export function listCategories(userId: string) {
  return prisma.category.findMany({
    where: { userId, deletedAt: null },
    orderBy: { name: 'asc' },
  });
}

export async function getCategory(userId: string, id: string) {
  const category = await prisma.category.findFirst({
    where: { id, userId, deletedAt: null },
  });
  if (!category) {
    throw new HttpError(404, 'Category not found');
  }
  return category;
}

export async function updateCategory(userId: string, id: string, input: UpdateCategoryInput) {
  await getCategory(userId, id);
  try {
    return await prisma.category.update({
      where: { id },
      data: input,
    });
  } catch (err) {
    toHttpError(err, 'A category with this name already exists');
  }
}

export async function deleteCategory(userId: string, id: string): Promise<void> {
  await getCategory(userId, id);
  await prisma.category.update({
    where: { id },
    data: { deletedAt: new Date() },
  });
}
