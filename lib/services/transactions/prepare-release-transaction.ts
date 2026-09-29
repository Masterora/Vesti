import { db } from "@/lib/db";
import { getEscrowAdapterMode } from "@/lib/blockchain/escrow-adapter";
import {
  inspectPreparedRelease,
  prepareReleaseEscrowTransaction
} from "@/lib/blockchain/solana-escrow-transactions";
import { assertAllowed, assertFound, assertState } from "@/lib/services/errors";
import {
  assertEscrowTransactionMatches,
  getOrCreateEscrowTransaction
} from "@/lib/services/transactions/escrow-transactions";
import type { PrepareReleaseTransactionInput } from "@/lib/validations/transaction";

export async function prepareReleaseTransaction(input: PrepareReleaseTransactionInput) {
  const contract = assertFound(
    await db.contract.findUnique({
      where: { id: input.contractId }
    }),
    "Contract not found"
  );
  const milestone = assertFound(
    await db.milestone.findFirst({
      where: {
        id: input.milestoneId,
        contractId: contract.id
      }
    }),
    "Milestone not found"
  );

  assertAllowed(
    input.walletAddress === contract.creatorWallet,
    "Only the Creator can prepare payment release"
  );
  assertState(contract.status === "active", "Contract must be active before release");
  assertState(Boolean(contract.workerWallet), "Assigned Worker wallet is required before release");
  assertState(milestone.status === "approved", "Only approved milestones can be released");
  assertState(
    contract.releasedAmount.plus(milestone.amount).lessThanOrEqualTo(contract.fundedAmount),
    "Released amount cannot exceed funded amount"
  );

  const mode = getEscrowAdapterMode();

  if (mode === "mock") {
    return {
      mode,
      action: "release_milestone" as const,
      contractId: contract.id,
      milestoneId: milestone.id,
      transaction: null,
      transactionId: null,
      idempotencyKey: input.idempotencyKey,
      canUseDirectAction: true,
      message: "Mock escrow mode does not require a wallet-signed transaction."
    };
  }

  const transactionInput = {
    contractId: contract.id,
    milestoneId: milestone.id,
    action: "release" as const,
    mode,
    walletAddress: input.walletAddress,
    amount: milestone.amount,
    idempotencyKey: input.idempotencyKey
  };
  const existing =
    (await db.escrowTransaction.findUnique({
      where: { idempotencyKey: input.idempotencyKey }
    })) ??
    (await db.escrowTransaction.findUnique({
      where: { operationKey: `release:${milestone.id}` }
    }));

  if (existing) {
    assertEscrowTransactionMatches(existing, transactionInput);
    assertState(existing.status !== "failed", "Previous release preparation failed; use a new idempotency key");
    assertState(existing.status === "prepared" && !existing.txSig, "Payment was already submitted; resume confirmation instead");
    assertState(Boolean(existing.preparedTransaction), "Prepared release transaction is unavailable");
    assertState(!existing.requiresReviewAt, "Payment requires manual review before another signature");
    assertState(Boolean(existing.recentBlockhash), "Prepared payment blockhash is unavailable");

    const inspection = await inspectPreparedRelease({
      contractId: contract.id,
      creatorWallet: contract.creatorWallet,
      workerWallet: contract.workerWallet!,
      fundedAmount: contract.fundedAmount,
      releasedAmountBefore: contract.releasedAmount,
      recentBlockhash: existing.recentBlockhash!
    });
    if (inspection === "valid") {
      return {
        mode,
        action: "release_milestone" as const,
        contractId: contract.id,
        milestoneId: milestone.id,
        transactionId: existing.id,
        idempotencyKey: existing.idempotencyKey,
        transaction: existing.preparedTransaction,
        canUseDirectAction: false,
        recentBlockhash: existing.recentBlockhash
      };
    }
    if (inspection === "review") {
      await db.escrowTransaction.updateMany({
        where: { id: existing.id, status: "prepared", txSig: null },
        data: {
          requiresReviewAt: new Date(),
          errorCode: "RELEASE_STATE_AMBIGUOUS",
          errorMessage: "Escrow state differs from the recorded payment amount; manual review required"
        }
      });
      assertState(false, "Payment requires manual review before another signature");
    }

    assertState(
      Date.now() - existing.updatedAt.getTime() >= 5 * 60_000,
      "Prepared payment expired; wait for finality before preparing again"
    );
    const expired = await db.escrowTransaction.updateMany({
      where: { id: existing.id, status: "prepared", txSig: null, requiresReviewAt: null },
      data: {
        status: "failed",
        operationKey: null,
        errorCode: "PREPARATION_EXPIRED",
        errorMessage: "Prepared payment expired without an on-chain release; safe to prepare again"
      }
    });
    assertState(expired.count === 1, "Payment state changed while checking the prepared transaction; refresh and retry");
    assertState(existing.idempotencyKey !== input.idempotencyKey, "Prepared payment expired; use a new idempotency key");
  }

  const transactionRecord = await db.$transaction((tx) =>
    getOrCreateEscrowTransaction(tx, transactionInput)
  );

  let prepared;
  try {
    prepared = await prepareReleaseEscrowTransaction({
      contractId: contract.id,
      milestoneId: milestone.id,
      creatorWallet: contract.creatorWallet,
      workerWallet: contract.workerWallet!,
      amount: milestone.amount
    });
  } catch (error) {
    await db.escrowTransaction.update({
      where: { id: transactionRecord.id },
      data: {
        status: "failed",
        operationKey: null,
        errorMessage: error instanceof Error ? error.message : "Release preparation failed"
      }
    });
    throw error;
  }

  await db.escrowTransaction.update({
    where: { id: transactionRecord.id },
    data: {
      preparedTransaction: prepared.transaction,
      recentBlockhash: prepared.recentBlockhash
    }
  });

  return {
    mode,
    action: "release_milestone" as const,
    contractId: contract.id,
    milestoneId: milestone.id,
    transactionId: transactionRecord.id,
    idempotencyKey: input.idempotencyKey,
    transaction: prepared.transaction,
    canUseDirectAction: false,
    escrowAccount: prepared.escrowAccount,
    vaultAccount: prepared.vaultAccount,
    creatorTokenAccount: prepared.creatorTokenAccount,
    workerTokenAccount: prepared.workerTokenAccount,
    amountUnits: prepared.amountUnits,
    recentBlockhash: prepared.recentBlockhash
  };
}
