-- CreateEnum
CREATE TYPE "ContractStatus" AS ENUM ('draft', 'funded', 'active', 'completed', 'cancelled', 'disputed');

-- CreateEnum
CREATE TYPE "MilestoneStatus" AS ENUM ('pending', 'ready', 'submitted', 'revision_requested', 'approved', 'released', 'disputed');

-- CreateEnum
CREATE TYPE "EventType" AS ENUM ('contract_created', 'contract_funded', 'contract_activated', 'milestone_ready', 'milestone_proof_submitted', 'milestone_revision_requested', 'milestone_approved', 'milestone_released', 'contract_completed', 'contract_cancelled', 'contract_disputed');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "walletAddress" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Contract" (
    "id" TEXT NOT NULL,
    "creatorWallet" TEXT NOT NULL,
    "workerWallet" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "totalAmount" DECIMAL(18,6) NOT NULL,
    "fundedAmount" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "releasedAmount" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "status" "ContractStatus" NOT NULL DEFAULT 'draft',
    "escrowAccount" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Contract_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Milestone" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "index" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "amount" DECIMAL(18,6) NOT NULL,
    "dueAt" TIMESTAMP(3),
    "status" "MilestoneStatus" NOT NULL DEFAULT 'pending',
    "submittedAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "releasedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Milestone_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProofSubmission" (
    "id" TEXT NOT NULL,
    "milestoneId" TEXT NOT NULL,
    "submittedBy" TEXT NOT NULL,
    "note" TEXT NOT NULL,
    "proofUrl" TEXT,
    "proofHash" TEXT,
    "version" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProofSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Event" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "milestoneId" TEXT,
    "actorWallet" TEXT NOT NULL,
    "eventType" "EventType" NOT NULL,
    "payload" JSONB,
    "txSig" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Event_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_walletAddress_key" ON "User"("walletAddress");

-- CreateIndex
CREATE INDEX "Contract_creatorWallet_idx" ON "Contract"("creatorWallet");

-- CreateIndex
CREATE INDEX "Contract_workerWallet_idx" ON "Contract"("workerWallet");

-- CreateIndex
CREATE INDEX "Contract_status_idx" ON "Contract"("status");

-- CreateIndex
CREATE INDEX "Milestone_contractId_idx" ON "Milestone"("contractId");

-- CreateIndex
CREATE INDEX "Milestone_status_idx" ON "Milestone"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Milestone_contractId_index_key" ON "Milestone"("contractId", "index");

-- CreateIndex
CREATE INDEX "ProofSubmission_milestoneId_idx" ON "ProofSubmission"("milestoneId");

-- CreateIndex
CREATE INDEX "ProofSubmission_submittedBy_idx" ON "ProofSubmission"("submittedBy");

-- CreateIndex
CREATE UNIQUE INDEX "ProofSubmission_milestoneId_version_key" ON "ProofSubmission"("milestoneId", "version");

-- CreateIndex
CREATE INDEX "Event_contractId_idx" ON "Event"("contractId");

-- CreateIndex
CREATE INDEX "Event_milestoneId_idx" ON "Event"("milestoneId");

-- CreateIndex
CREATE INDEX "Event_eventType_idx" ON "Event"("eventType");

-- CreateIndex
CREATE INDEX "Event_createdAt_idx" ON "Event"("createdAt");

-- AddForeignKey
ALTER TABLE "Milestone" ADD CONSTRAINT "Milestone_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProofSubmission" ADD CONSTRAINT "ProofSubmission_milestoneId_fkey" FOREIGN KEY ("milestoneId") REFERENCES "Milestone"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_milestoneId_fkey" FOREIGN KEY ("milestoneId") REFERENCES "Milestone"("id") ON DELETE SET NULL ON UPDATE CASCADE;
