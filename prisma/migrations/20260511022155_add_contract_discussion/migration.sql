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

-- CreateIndex
CREATE INDEX "ContractComment_contractId_createdAt_idx" ON "ContractComment"("contractId", "createdAt");

-- CreateIndex
CREATE INDEX "ContractComment_authorWallet_idx" ON "ContractComment"("authorWallet");

-- AddForeignKey
ALTER TABLE "ContractComment" ADD CONSTRAINT "ContractComment_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE CASCADE ON UPDATE CASCADE;
