-- CreateTable
CREATE TABLE "ContractApplication" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "applicantWallet" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContractApplication_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ContractApplication_contractId_createdAt_idx" ON "ContractApplication"("contractId", "createdAt");

-- CreateIndex
CREATE INDEX "ContractApplication_applicantWallet_idx" ON "ContractApplication"("applicantWallet");

-- CreateIndex
CREATE UNIQUE INDEX "ContractApplication_contractId_applicantWallet_key" ON "ContractApplication"("contractId", "applicantWallet");

-- AddForeignKey
ALTER TABLE "ContractApplication" ADD CONSTRAINT "ContractApplication_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE CASCADE ON UPDATE CASCADE;
