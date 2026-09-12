import { prisma } from '../../src/prisma';

export async function resetDatabase(): Promise<void> {
  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE "notifications", "recurring_expenses", "budgets", "expenses", "categories", "oauth_accounts", "refresh_tokens", "users" RESTART IDENTITY CASCADE;`,
  );
}
