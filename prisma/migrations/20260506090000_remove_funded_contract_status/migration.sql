UPDATE "Contract" SET "status" = 'active' WHERE "status" = 'funded';

ALTER TYPE "ContractStatus" RENAME TO "ContractStatus_old";

CREATE TYPE "ContractStatus" AS ENUM ('draft', 'active', 'completed', 'cancelled', 'disputed');

ALTER TABLE "Contract" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Contract"
  ALTER COLUMN "status" TYPE "ContractStatus" USING "status"::text::"ContractStatus";
ALTER TABLE "Contract" ALTER COLUMN "status" SET DEFAULT 'draft';

DROP TYPE "ContractStatus_old";
