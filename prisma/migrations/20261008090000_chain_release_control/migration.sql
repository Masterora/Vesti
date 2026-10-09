-- AlterTable
ALTER TABLE "EscrowTransaction" ADD COLUMN     "releaseControlEpoch" BIGINT,
ADD COLUMN     "reconciliationLeaseEpoch" BIGINT;

-- CreateTable
CREATE TABLE "ChainReleaseControl" (
    "environmentKey" TEXT NOT NULL,
    "genesisHash" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "mint" TEXT NOT NULL,
    "phase" TEXT NOT NULL DEFAULT 'draining',
    "epoch" BIGINT NOT NULL DEFAULT 0,
    "activeManifestSha256" TEXT NOT NULL,
    "targetManifestSha256" TEXT,
    "maintenanceBatch" TEXT,
    "actor" TEXT NOT NULL,
    "drainEvidence" JSONB,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChainReleaseControl_pkey" PRIMARY KEY ("environmentKey")
);

-- CreateTable
CREATE TABLE "ChainReleaseTransition" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "fromReleaseId" TEXT NOT NULL,
    "toReleaseId" TEXT NOT NULL,
    "epoch" BIGINT NOT NULL,
    "fromManifestSha256" TEXT NOT NULL,
    "toManifestSha256" TEXT NOT NULL,
    "approvalSha256" TEXT NOT NULL,
    "beforeEvidence" JSONB NOT NULL,
    "afterEvidence" JSONB NOT NULL,
    "actor" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChainReleaseTransition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChainReleaseTransitionBatch" (
    "id" TEXT NOT NULL,
    "transitionId" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "approvalSha256" TEXT NOT NULL,
    "beforeEvidence" JSONB NOT NULL,
    "afterEvidence" JSONB NOT NULL,
    "actor" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChainReleaseTransitionBatch_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ChainReleaseTransition_contractId_fromReleaseId_toReleaseId_key" ON "ChainReleaseTransition"("contractId", "fromReleaseId", "toReleaseId");

-- CreateIndex
CREATE UNIQUE INDEX "ChainReleaseTransitionBatch_transitionId_batchId_key" ON "ChainReleaseTransitionBatch"("transitionId", "batchId");

-- AddForeignKey
ALTER TABLE "ChainReleaseTransitionBatch" ADD CONSTRAINT "ChainReleaseTransitionBatch_transitionId_fkey" FOREIGN KEY ("transitionId") REFERENCES "ChainReleaseTransition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


ALTER TABLE "ChainReleaseControl" ADD CONSTRAINT "ChainReleaseControl_phase_check" CHECK (phase IN ('open', 'draining', 'frozen', 'deploying', 'rebinding'));
ALTER TABLE "ChainReleaseControl" ADD CONSTRAINT "ChainReleaseControl_epoch_check" CHECK (epoch >= 0);
