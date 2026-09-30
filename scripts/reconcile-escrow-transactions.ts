import "dotenv/config";
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { recoverChainOperation } from "@/lib/services/transactions/chain-operations";
import { syncContractChain } from "@/lib/services/transactions/chain-sync";
import { reconciliationLimit, reconciliationRetryState } from "@/lib/services/transactions/reconciliation-policy";

async function main() {
  if (process.env.ESCROW_ADAPTER_MODE !== "onchain")
    throw new Error("ESCROW_ADAPTER_MODE=onchain is required");
  const batchSize = Number(process.env.RECONCILIATION_BATCH_SIZE ?? 25);
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 100)
    throw new Error("Invalid reconciliation batch size");
  const now = new Date();
  const maximumAttempts = reconciliationLimit();
  const candidates = await db.escrowTransaction.findMany({
    where: {
      mode: "onchain",
      status: {
        in: ["building", "prepared", "signed", "submitted", "confirmed"],
      },
      requiresReviewAt: null,
      AND: [
        { OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }] },
        {
          OR: [
            { reconciliationLeaseExpiresAt: null },
            { reconciliationLeaseExpiresAt: { lte: now } },
          ],
        },
      ],
    },
    orderBy: { createdAt: "asc" },
    take: batchSize,
  });
  let failures = 0;
  for (const candidate of candidates) {
    const leaseId = randomUUID();
    const claimed = await db.escrowTransaction.updateMany({
      where: {
        id: candidate.id,
        status: candidate.status,
        requiresReviewAt: null,
        reconciliationAttempts: candidate.reconciliationAttempts,
        OR: [
          { reconciliationLeaseExpiresAt: null },
          { reconciliationLeaseExpiresAt: { lte: new Date() } },
        ],
      },
      data: {
        reconciliationLeaseId: leaseId,
        reconciliationLeaseExpiresAt: new Date(Date.now() + 120000),
        reconciliationAttempts: { increment: 1 },
        lastAttemptAt: new Date(),
      },
    });
    if (claimed.count !== 1) continue;
    try {
      const result = await recoverChainOperation(candidate.id, leaseId);
      await db.escrowTransaction.updateMany({
        where: { id: candidate.id, reconciliationLeaseId: leaseId },
        data: {
          reconciliationLeaseId: null,
          reconciliationLeaseExpiresAt: null,
          ...(["failed", "reconciled"].includes(result.status)
            ? { nextAttemptAt: null }
            : reconciliationRetryState(candidate.reconciliationAttempts + 1, maximumAttempts)),
        },
      });
    } catch {
      failures++;
      await db.escrowTransaction.updateMany({
        where: { id: candidate.id, reconciliationLeaseId: leaseId },
        data: {
          ...reconciliationRetryState(candidate.reconciliationAttempts + 1, maximumAttempts),
          reconciliationLeaseId: null,
          reconciliationLeaseExpiresAt: null,
        },
      });
      console.error("Reconciliation deferred", { transactionId: candidate.id });
    }
  }
  // Detect direct program operations even without a Web transaction record.
  const contracts = await db.contract.findMany({
    where: {
      workerWallet: { not: null },
      chainSyncStatus: { not: "review" },
      NOT: { escrowTransactions: { some: { requiresReviewAt: { not: null }, status: { in: ["building", "prepared", "signed", "submitted", "confirmed"] } } } },
      OR: [
        { status: { in: ["draft", "active", "disputed"] } },
        { chainBaselineKind: "initialized" },
        { escrowAccount: { not: null } },
        {
          escrowTransactions: {
            some: {
              mode: "onchain",
              status: {
                in: [
                  "building",
                  "prepared",
                  "signed",
                  "submitted",
                  "confirmed",
                ],
              },
            },
          },
        },
      ],
    },
    orderBy: { updatedAt: "asc" },
    take: batchSize,
  });
  for (const contract of contracts) {
    try {
      await syncContractChain(contract.id);
    } catch {
      failures++;
      console.error("Contract scan deferred", { contractId: contract.id });
    }
  }
  console.log(
    JSON.stringify({
      operations: candidates.length,
      contracts: contracts.length,
      failures,
    }),
  );
  if (failures) process.exitCode = 1;
}
void main()
  .catch((error) => {
    console.error(
      error instanceof Error ? error.message : "Reconciliation failed",
    );
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
