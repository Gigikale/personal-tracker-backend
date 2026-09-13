import { Router } from 'express';

import { prisma } from '../prisma';
import { logger } from '../lib/logger';

export const healthRouter = Router();

healthRouter.get('/', async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: 'ok', database: 'ok' });
  } catch (err) {
    logger.error({ err }, 'Health check failed: database unreachable');
    res.status(503).json({ status: 'error', database: 'unreachable' });
  }
});
