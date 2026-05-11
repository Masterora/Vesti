-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "ContractStatus" AS ENUM ('open', 'claimed', 'draft', 'active', 'completed', 'cancelled', 'disputed');

-- CreateEnum
CREATE TYPE "MilestoneStatus" AS ENUM ('pending', 'ready', 'submitted', 'revision_requested', 'approved', 'released', 'disputed');

-- CreateEnum
CREATE TYPE "EventType" AS ENUM ('contract_created', 'contract_claim_requested', 'contract_claim_accepted', 'contract_funded', 'contract_activated', 'milestone_ready', 'milestone_proof_submitted', 'milestone_revision_requested', 'milestone_approved', 'milestone_released', 'contract_completed', 'contract_cancelled', 'contract_disputed');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "walletAddress" TEXT NOT NULL,
    "displayName" TEXT,
    "email" TEXT,
    "bio" TEXT,
    "avatarImage" TEXT,
    "avatarUpdatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WalletAuthChallenge" (
    "id" TEXT NOT NULL,
    "walletAddress" TEXT NOT NULL,
    "nonce" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WalletAuthChallenge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Contract" (
    "id" TEXT NOT NULL,
    "displayId" TEXT NOT NULL,
    "creatorWallet" TEXT NOT NULL,
    "workerWallet" TEXT,
    "requestedWorkerWallet" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "isPublic" BOOLEAN NOT NULL DEFAULT false,
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
CREATE TABLE "ContractApplication" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "applicantWallet" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContractApplication_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContractComment" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "authorWallet" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContractComment_pkey" PRIMARY KEY ("id")
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
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "WalletAuthChallenge_nonce_key" ON "WalletAuthChallenge"("nonce");

-- CreateIndex
CREATE INDEX "WalletAuthChallenge_walletAddress_idx" ON "WalletAuthChallenge"("walletAddress");

-- CreateIndex
CREATE INDEX "WalletAuthChallenge_expiresAt_idx" ON "WalletAuthChallenge"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "Contract_displayId_key" ON "Contract"("displayId");

-- CreateIndex
CREATE INDEX "Contract_creatorWallet_idx" ON "Contract"("creatorWallet");

-- CreateIndex
CREATE INDEX "Contract_workerWallet_idx" ON "Contract"("workerWallet");

-- CreateIndex
CREATE INDEX "Contract_requestedWorkerWallet_idx" ON "Contract"("requestedWorkerWallet");

-- CreateIndex
CREATE INDEX "Contract_status_idx" ON "Contract"("status");

-- CreateIndex
CREATE INDEX "ContractApplication_contractId_createdAt_idx" ON "ContractApplication"("contractId", "createdAt");

-- CreateIndex
CREATE INDEX "ContractApplication_applicantWallet_idx" ON "ContractApplication"("applicantWallet");

-- CreateIndex
CREATE UNIQUE INDEX "ContractApplication_contractId_applicantWallet_key" ON "ContractApplication"("contractId", "applicantWallet");

-- CreateIndex
CREATE INDEX "ContractComment_contractId_createdAt_idx" ON "ContractComment"("contractId", "createdAt");

-- CreateIndex
CREATE INDEX "ContractComment_authorWallet_idx" ON "ContractComment"("authorWallet");

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
CREATE INDEX "Event_contractId_createdAt_idx" ON "Event"("contractId", "createdAt");

-- CreateIndex
CREATE INDEX "Event_milestoneId_idx" ON "Event"("milestoneId");

-- CreateIndex
CREATE INDEX "Event_eventType_idx" ON "Event"("eventType");

-- CreateIndex
CREATE INDEX "Event_createdAt_idx" ON "Event"("createdAt");

-- AddForeignKey
ALTER TABLE "Contract" ADD CONSTRAINT "Contract_creatorWallet_fkey" FOREIGN KEY ("creatorWallet") REFERENCES "User"("walletAddress") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contract" ADD CONSTRAINT "Contract_workerWallet_fkey" FOREIGN KEY ("workerWallet") REFERENCES "User"("walletAddress") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractApplication" ADD CONSTRAINT "ContractApplication_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractComment" ADD CONSTRAINT "ContractComment_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Milestone" ADD CONSTRAINT "Milestone_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProofSubmission" ADD CONSTRAINT "ProofSubmission_milestoneId_fkey" FOREIGN KEY ("milestoneId") REFERENCES "Milestone"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_milestoneId_fkey" FOREIGN KEY ("milestoneId") REFERENCES "Milestone"("id") ON DELETE SET NULL ON UPDATE CASCADE;
