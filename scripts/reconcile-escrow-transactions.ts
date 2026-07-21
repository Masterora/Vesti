import "dotenv/config";
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { confirmFundTransaction } from "@/lib/services/transactions/confirm-fund-transaction";
import { confirmReleaseTransaction } from "@/lib/services/transactions/confirm-release-transaction";

const leaseDurationMs = 2 * 60_000;

function getPositiveIntegerSetting(name: string, fallback: number) {
  const value = process.env[name]?.trim();

  if (!value) {
    return fallback;
  }

  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }

  return parsed;
}

const batchSize = getPositiveIntegerSetting("RECONCILIATION_BATCH_SIZE", 25);
const maxAttempts = getPositiveIntegerSetting("RECONCILIATION_MAX_ATTEMPTS", 12);

function getRetryDelayMs(attempt: number) {
  return Math.min(5_000 * 2 ** Math.max(attempt - 1, 0), 15 * 60_000);
}

async function claimTransaction(transactionId: string, now: Date) {
  const leaseId = randomUUID();
  const claimed = await db.escrowTransaction.updateMany({
    where: {
      id: transactionId,
      status: "submitted",
      requiresReviewAt: null,
      AND: [
        { OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }] },
        {
          OR: [
            { reconciliationLeaseExpiresAt: null },
            { reconciliationLeaseExpiresAt: { lte: now } }
          ]
        }
      ]
    },
    data: {
      reconciliationLeaseId: leaseId,
      reconciliationLeaseExpiresAt: new Date(now.getTime() + leaseDurationMs),
      reconciliationAttempts: { increment: 1 },
      lastAttemptAt: now
    }
  });

  if (claimed.count !== 1) {
    return null;
  }

  return db.escrowTransaction.findUniqueOrThrow({ where: { id: transactionId } });
}

async function reconcileClaimedTransaction(transaction: Awaited<ReturnType<typeof claimTransaction>>) {
  if (!transaction?.txSig || !transaction.reconciliationLeaseId) {
    return;
  }

  try {
    if (transaction.action === "fund") {
      await confirmFundTransaction({
        contractId: transaction.contractId,
        walletAddress: transaction.walletAddress,
        transactionId: transaction.id,
        txSig: transaction.txSig
      });
      return;
    }

    if (transaction.action === "release" && transaction.milestoneId) {
      await confirmReleaseTransaction({
        contractId: transaction.contractId,
        milestoneId: transaction.milestoneId,
        walletAddress: transaction.walletAddress,
        transactionId: transaction.id,
        txSig: transaction.txSig
      });
      return;
    }

    throw new Error(`Unsupported submitted escrow action: ${transaction.action}`);
  } catch (error) {
    const now = new Date();
    const requiresReview = transaction.reconciliationAttempts >= maxAttempts;
    const message = error instanceof Error ? error.message : "Escrow reconciliation failed";

    await db.escrowTransaction.updateMany({
      where: {
        id: transaction.id,
        status: "submitted",
        reconciliationLeaseId: transaction.reconciliationLeaseId
      },
      data: {
        errorCode: "RECONCILIATION_RETRY",
        errorMessage: message.slice(0, 1000),
        nextAttemptAt: requiresReview
          ? null
          : new Date(now.getTime() + getRetryDelayMs(transaction.reconciliationAttempts)),
        requiresReviewAt: requiresReview ? now : null,
        reconciliationLeaseId: null,
        reconciliationLeaseExpiresAt: null
      }
    });

    console.error("Escrow reconciliation attempt failed", {
      transactionId: transaction.id,
      attempt: transaction.reconciliationAttempts,
      requiresReview,
      error: message
    });
  }
}

async function main() {
  if (process.env.ESCROW_ADAPTER_MODE !== "onchain") {
    throw new Error("ESCROW_ADAPTER_MODE=onchain is required for escrow reconciliation");
  }

  const now = new Date();
  const candidates = await db.escrowTransaction.findMany({
    where: {
      mode: "onchain",
      status: "submitted",
      txSig: { not: null },
      requiresReviewAt: null,
      action: { in: ["fund", "release"] },
      AND: [
        { OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }] },
        {
          OR: [
            { reconciliationLeaseExpiresAt: null },
            { reconciliationLeaseExpiresAt: { lte: now } }
          ]
        }
      ]
    },
    orderBy: { submittedAt: "asc" },
    take: batchSize,
    select: { id: true }
  });

  for (const candidate of candidates) {
    const transaction = await claimTransaction(candidate.id, new Date());
    await reconcileClaimedTransaction(transaction);
  }

  console.log(`Processed ${candidates.length} escrow reconciliation candidate(s).`);
}

void main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
