-- CreateTable
CREATE TABLE "savings_contributions" (
    "id" TEXT NOT NULL,
    "goalId" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "note" TEXT,
    "contributedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "savings_contributions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "savings_contributions_goalId_contributedAt_idx" ON "savings_contributions"("goalId", "contributedAt");

-- AddForeignKey
ALTER TABLE "savings_contributions" ADD CONSTRAINT "savings_contributions_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "savings_goals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: money added before history existed has no dates, so record each goal's balance
-- as a single opening entry. This keeps the history summing to currentAmount.
INSERT INTO "savings_contributions" ("id", "goalId", "amount", "note", "contributedAt")
SELECT gen_random_uuid()::text, "id", "currentAmount", 'Balance before history was recorded', "createdAt"
FROM "savings_goals"
WHERE "currentAmount" <> 0;
