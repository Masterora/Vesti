CREATE TYPE "DisputePolicy" AS ENUM ('bilateral', 'arbitrator');

ALTER TABLE "Contract"
  ADD COLUMN "disputePolicy" "DisputePolicy" NOT NULL DEFAULT 'bilateral',
  ADD COLUMN "arbitratorWallet" TEXT;

ALTER TABLE "Contract"
  ADD CONSTRAINT "Contract_dispute_policy_wallet_check"
  CHECK (
    ("disputePolicy" = 'bilateral' AND "arbitratorWallet" IS NULL)
    OR (
      "disputePolicy" = 'arbitrator'
      AND "arbitratorWallet" IS NOT NULL
      AND length("arbitratorWallet") > 0
      AND "arbitratorWallet" <> "creatorWallet"
      AND "arbitratorWallet" IS DISTINCT FROM "workerWallet"
    )
  );
