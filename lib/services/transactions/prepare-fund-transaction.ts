import { db } from "@/lib/db";
import { getEscrowAdapterMode } from "@/lib/blockchain/escrow-adapter";
import { prepareFundEscrowTransaction } from "@/lib/blockchain/solana-escrow-transactions";
import { assertAllowed, assertFound, assertState } from "@/lib/services/errors";
import {
  assertEscrowTransactionMatches,
  getOrCreateEscrowTransaction
} from "@/lib/services/transactions/escrow-transactions";
import type { PrepareFundTransactionInput } from "@/lib/validations/transaction";

export async function prepareFundTransaction(input: PrepareFundTransactionInput) {
  const contract = assertFound(
    await db.contract.findUnique({
      where: { id: input.contractId }
    }),
    "Contract not found"
  );

  assertAllowed(
    input.walletAddress === contract.creatorWallet,
    "Only the Creator can prepare funding"
  );
  assertState(contract.status === "draft", "Only draft contracts can be funded");
  assertState(Boolean(contract.workerWallet), "Assigned Worker wallet is required before funding");

  const mode = getEscrowAdapterMode();

  if (mode === "mock") {
    return {
      mode,
      action: "fund_contract" as const,
      contractId: contract.id,
      transaction: null,
      transactionId: null,
      idempotencyKey: input.idempotencyKey,
      canUseDirectAction: true,
      message: "Mock escrow mode does not require a wallet-signed transaction."
    };
  }

  const transactionInput = {
    contractId: contract.id,
    action: "fund" as const,
    mode,
    walletAddress: input.walletAddress,
    amount: contract.totalAmount,
    idempotencyKey: input.idempotencyKey
  };
  const existing = await db.escrowTransaction.findUnique({
    where: { idempotencyKey: input.idempotencyKey }
  });

  if (existing) {
    assertEscrowTransactionMatches(existing, transactionInput);
    assertState(existing.status !== "failed", "Previous funding preparation failed; use a new idempotency key");
    assertState(Boolean(existing.preparedTransaction), "Prepared funding transaction is unavailable");
    return {
      mode,
      action: "fund_contract" as const,
      contractId: contract.id,
      transactionId: existing.id,
      idempotencyKey: existing.idempotencyKey,
      transaction: existing.preparedTransaction,
      canUseDirectAction: false,
      recentBlockhash: existing.recentBlockhash
    };
  }

  const transactionRecord = await db.$transaction((tx) =>
    getOrCreateEscrowTransaction(tx, transactionInput)
  );

  let prepared;
  try {
    prepared = await prepareFundEscrowTransaction({
      contractId: contract.id,
      creatorWallet: contract.creatorWallet,
      workerWallet: contract.workerWallet!,
      amount: contract.totalAmount
    });
  } catch (error) {
    await db.escrowTransaction.update({
      where: { id: transactionRecord.id },
      data: {
        status: "failed",
        operationKey: null,
        errorMessage: error instanceof Error ? error.message : "Funding preparation failed"
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
    action: "fund_contract" as const,
    contractId: contract.id,
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
