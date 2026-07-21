-- AlterEnum
ALTER TYPE "EventType" ADD VALUE 'dispute_resolution_proposed';
ALTER TYPE "EventType" ADD VALUE 'contract_dispute_resolved';
ALTER TYPE "EventType" ADD VALUE 'contract_refunded';

-- AlterTable
ALTER TABLE "Contract" ADD COLUMN "refundedAmount" DECIMAL(18,6) NOT NULL DEFAULT 0;

-- CreateEnum
CREATE TYPE "EscrowTransactionAction" AS ENUM ('fund', 'release', 'dispute', 'resolve', 'refund');

-- CreateEnum
CREATE TYPE "EscrowTransactionMode" AS ENUM ('mock', 'onchain');

-- CreateEnum
CREATE TYPE "EscrowTransactionStatus" AS ENUM ('prepared', 'submitted', 'confirmed', 'reconciled', 'failed');

-- CreateEnum
CREATE TYPE "DisputeStatus" AS ENUM ('open', 'proposed', 'resolved');

-- CreateEnum
CREATE TYPE "DisputeOutcome" AS ENUM ('release_to_worker', 'refund_to_creator');

-- CreateTable
CREATE TABLE "EscrowTransaction" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "milestoneId" TEXT,
    "action" "EscrowTransactionAction" NOT NULL,
    "mode" "EscrowTransactionMode" NOT NULL,
    "walletAddress" TEXT NOT NULL,
    "amount" DECIMAL(18,6),
    "idempotencyKey" TEXT NOT NULL,
    "operationKey" TEXT,
    "txSig" TEXT,
    "preparedTransaction" TEXT,
    "recentBlockhash" TEXT,
    "status" "EscrowTransactionStatus" NOT NULL DEFAULT 'prepared',
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "submittedAt" TIMESTAMP(3),
    "confirmedAt" TIMESTAMP(3),
    "reconciledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EscrowTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Dispute" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "milestoneId" TEXT NOT NULL,
    "openedBy" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "previousMilestoneStatus" "MilestoneStatus" NOT NULL,
    "status" "DisputeStatus" NOT NULL DEFAULT 'open',
    "proposedOutcome" "DisputeOutcome",
    "proposedBy" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Dispute_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EscrowTransaction_idempotencyKey_key" ON "EscrowTransaction"("idempotencyKey");
CREATE UNIQUE INDEX "EscrowTransaction_operationKey_key" ON "EscrowTransaction"("operationKey");
CREATE UNIQUE INDEX "EscrowTransaction_txSig_key" ON "EscrowTransaction"("txSig");
CREATE INDEX "EscrowTransaction_contractId_createdAt_idx" ON "EscrowTransaction"("contractId", "createdAt");
CREATE INDEX "EscrowTransaction_milestoneId_createdAt_idx" ON "EscrowTransaction"("milestoneId", "createdAt");
CREATE INDEX "EscrowTransaction_status_idx" ON "EscrowTransaction"("status");
CREATE UNIQUE INDEX "Dispute_milestoneId_key" ON "Dispute"("milestoneId");
CREATE INDEX "Dispute_contractId_createdAt_idx" ON "Dispute"("contractId", "createdAt");
CREATE INDEX "Dispute_status_idx" ON "Dispute"("status");

-- AddForeignKey
ALTER TABLE "EscrowTransaction" ADD CONSTRAINT "EscrowTransaction_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EscrowTransaction" ADD CONSTRAINT "EscrowTransaction_milestoneId_fkey" FOREIGN KEY ("milestoneId") REFERENCES "Milestone"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Dispute" ADD CONSTRAINT "Dispute_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Dispute" ADD CONSTRAINT "Dispute_milestoneId_fkey" FOREIGN KEY ("milestoneId") REFERENCES "Milestone"("id") ON DELETE CASCADE ON UPDATE CASCADE;
