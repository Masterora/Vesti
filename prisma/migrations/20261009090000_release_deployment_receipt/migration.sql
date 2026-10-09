ALTER TABLE "ChainReleaseControl"
  ADD COLUMN "deploymentCandidateSha256" TEXT,
  ADD COLUMN "deploymentCandidateEvidence" JSONB,
  ADD COLUMN "deploymentReceiptEvidence" JSONB;
