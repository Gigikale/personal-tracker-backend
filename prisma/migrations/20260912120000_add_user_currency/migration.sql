-- CreateEnum
CREATE TYPE "CurrencyCode" AS ENUM ('USD', 'NGN');

-- AlterTable
ALTER TABLE "users" ADD COLUMN "currency" "CurrencyCode" NOT NULL DEFAULT 'USD';
