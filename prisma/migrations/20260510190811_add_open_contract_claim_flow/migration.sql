-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ContractStatus" ADD VALUE 'open';
ALTER TYPE "ContractStatus" ADD VALUE 'claimed';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "EventType" ADD VALUE 'contract_claim_requested';
ALTER TYPE "EventType" ADD VALUE 'contract_claim_accepted';

-- AlterTable
ALTER TABLE "Contract" ADD COLUMN     "requestedWorkerWallet" TEXT,
ALTER COLUMN "workerWallet" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "Contract_requestedWorkerWallet_idx" ON "Contract"("requestedWorkerWallet");
