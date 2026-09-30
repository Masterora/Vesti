-- CreateEnum
CREATE TYPE "EscrowTransactionKind" AS ENUM ('fund', 'release', 'dispute_open', 'dispute_propose', 'dispute_accept_release', 'dispute_accept_refund', 'dispute_arbitrate_release', 'dispute_arbitrate_refund');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "EscrowTransactionStatus" ADD VALUE 'building';
ALTER TYPE "EscrowTransactionStatus" ADD VALUE 'signed';

-- AlterTable
ALTER TABLE "Contract" ADD COLUMN     "businessRevision" BIGINT NOT NULL DEFAULT 0,
ADD COLUMN     "chainBaselineEvidence" JSONB,
ADD COLUMN     "chainBaselineKind" TEXT NOT NULL DEFAULT 'absent',
ADD COLUMN     "chainLastSyncedInstructionIndex" INTEGER,
ADD COLUMN     "chainLastSyncedSlot" BIGINT,
ADD COLUMN     "chainLastSyncedTransactionIndex" INTEGER,
ADD COLUMN     "chainReviewAt" TIMESTAMP(3),
ADD COLUMN     "chainReviewCode" TEXT,
ADD COLUMN     "chainReviewEvidence" JSONB,
ADD COLUMN     "chainSyncStatus" TEXT NOT NULL DEFAULT 'uninitialized';

-- AlterTable
ALTER TABLE "EscrowTransaction" ADD COLUMN     "attempt" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "buildExpiresAt" TIMESTAMP(3),
ADD COLUMN     "buildToken" TEXT,
ADD COLUMN     "contextVersion" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "contractLockKey" TEXT,
ADD COLUMN     "finalizedSlot" BIGINT,
ADD COLUMN     "finalizedTransactionIndex" INTEGER,
ADD COLUMN     "kind" "EscrowTransactionKind",
ADD COLUMN     "lastValidBlockHeight" BIGINT,
ADD COLUMN     "logicalOperationKey" TEXT,
ADD COLUMN     "messageHash" TEXT,
ADD COLUMN     "operationContext" JSONB,
ADD COLUMN     "signedAt" TIMESTAMP(3),
ADD COLUMN     "signedTransaction" TEXT;

-- AlterTable
ALTER TABLE "Dispute" ADD COLUMN     "chainAddress" TEXT,
ADD COLUMN     "milestoneHash" TEXT,
ADD COLUMN     "proposalVersion" BIGINT NOT NULL DEFAULT 0,
ADD COLUMN     "proposedAmountUnits" TEXT,
ADD COLUMN     "reasonHash" TEXT,
ADD COLUMN     "resolutionKind" TEXT,
ADD COLUMN     "resolvedBy" TEXT,
ADD COLUMN     "settledAmountUnits" TEXT,
ADD COLUMN     "source" TEXT NOT NULL DEFAULT 'web',
ALTER COLUMN "reason" DROP NOT NULL;

-- CreateTable
CREATE TABLE "ChainAppliedInstruction" (
    "id" TEXT NOT NULL,
    "networkGenesisHash" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "txSig" TEXT NOT NULL,
    "slot" BIGINT NOT NULL,
    "transactionIndex" INTEGER NOT NULL,
    "instructionIndex" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "parameters" JSONB NOT NULL,
    "evidenceHash" TEXT NOT NULL,
    "appliedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChainAppliedInstruction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ChainAppliedInstruction_contractId_slot_transactionIndex_in_idx" ON "ChainAppliedInstruction"("contractId", "slot", "transactionIndex", "instructionIndex");

-- CreateIndex
CREATE UNIQUE INDEX "ChainAppliedInstruction_networkGenesisHash_programId_txSig__key" ON "ChainAppliedInstruction"("networkGenesisHash", "programId", "txSig", "instructionIndex");

-- CreateIndex
CREATE UNIQUE INDEX "EscrowTransaction_contractLockKey_key" ON "EscrowTransaction"("contractLockKey");

-- CreateIndex
CREATE UNIQUE INDEX "EscrowTransaction_logicalOperationKey_attempt_key" ON "EscrowTransaction"("logicalOperationKey", "attempt");

-- AddForeignKey
ALTER TABLE "ChainAppliedInstruction" ADD CONSTRAINT "ChainAppliedInstruction_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Legacy records retain their signatures and operation keys. Missing protocol evidence
-- cannot be inferred from an old prepared status; lock and isolate for history review.
UPDATE "EscrowTransaction" SET "kind" = "action"::text::"EscrowTransactionKind"
WHERE "action" IN ('fund', 'release');
UPDATE "EscrowTransaction" SET "logicalOperationKey" = "operationKey";
UPDATE "EscrowTransaction" SET "contractLockKey" = ranked."contractId",
  "requiresReviewAt" = CASE WHEN "EscrowTransaction"."status" = 'prepared' OR "EscrowTransaction"."txSig" IS NULL THEN CURRENT_TIMESTAMP ELSE NULL END,
  "errorCode" = CASE WHEN "EscrowTransaction"."status" = 'prepared' OR "EscrowTransaction"."txSig" IS NULL THEN 'LEGACY_PROTOCOL_REVIEW' ELSE NULL END
FROM (SELECT DISTINCT ON ("contractId") "id", "contractId" FROM "EscrowTransaction"
  WHERE "mode" = 'onchain' AND "status" IN ('prepared', 'submitted', 'confirmed')
  ORDER BY "contractId", "createdAt", "id") ranked
WHERE "EscrowTransaction"."id" = ranked."id";
UPDATE "EscrowTransaction" SET "requiresReviewAt" = CURRENT_TIMESTAMP, "errorCode" = 'LEGACY_MULTIPLE_PENDING'
WHERE "mode" = 'onchain' AND "status" IN ('prepared', 'submitted', 'confirmed')
 AND "contractId" IN (SELECT "contractId" FROM "EscrowTransaction" WHERE "mode" = 'onchain' AND "status" IN ('prepared', 'submitted', 'confirmed') GROUP BY "contractId" HAVING COUNT(*) > 1);
UPDATE "Contract" SET "chainSyncStatus" = 'review', "chainReviewAt" = CURRENT_TIMESTAMP,
 "chainReviewCode" = 'LEGACY_PROTOCOL_REVIEW'
WHERE "id" IN (SELECT "contractId" FROM "EscrowTransaction" WHERE "requiresReviewAt" IS NOT NULL);
