import { Prisma } from '@prisma/client';

import { HttpError } from './errors';

export function toHttpError(err: unknown, conflictMessage = 'A record with this value already exists'): never {
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') throw new HttpError(409, conflictMessage);
    if (err.code === 'P2025') throw new HttpError(404, 'Record not found');
  }
  throw err;
}
