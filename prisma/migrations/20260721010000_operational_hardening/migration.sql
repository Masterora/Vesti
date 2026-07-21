-- CreateTable
CREATE TABLE "ApiRateLimitBucket" (
    "bucketKey" TEXT NOT NULL,
    "windowStart" TIMESTAMP(3) NOT NULL,
    "requestCount" INTEGER NOT NULL DEFAULT 1,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ApiRateLimitBucket_pkey" PRIMARY KEY ("bucketKey", "windowStart")
);

-- AlterTable
ALTER TABLE "EscrowTransaction"
ADD COLUMN "reconciliationAttempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "lastAttemptAt" TIMESTAMP(3),
ADD COLUMN "nextAttemptAt" TIMESTAMP(3),
ADD COLUMN "requiresReviewAt" TIMESTAMP(3),
ADD COLUMN "reconciliationLeaseId" TEXT,
ADD COLUMN "reconciliationLeaseExpiresAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "ApiRateLimitBucket_expiresAt_idx" ON "ApiRateLimitBucket"("expiresAt");
CREATE INDEX "EscrowTransaction_status_nextAttemptAt_idx" ON "EscrowTransaction"("status", "nextAttemptAt");
CREATE INDEX "EscrowTransaction_status_reconciliationLeaseExpiresAt_idx" ON "EscrowTransaction"("status", "reconciliationLeaseExpiresAt");
CREATE INDEX "EscrowTransaction_requiresReviewAt_idx" ON "EscrowTransaction"("requiresReviewAt");
