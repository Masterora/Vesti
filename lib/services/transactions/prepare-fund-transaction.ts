import { db } from "@/lib/db";
import { getEscrowAdapterMode } from "@/lib/blockchain/escrow-adapter";
import { prepareFundEscrowTransaction } from "@/lib/blockchain/solana-escrow-transactions";
import { assertAllowed, assertFound, assertState } from "@/lib/services/errors";
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
      canUseDirectAction: true,
      message: "Mock escrow mode does not require a wallet-signed transaction."
    };
  }

  const prepared = await prepareFundEscrowTransaction({
    contractId: contract.id,
    creatorWallet: contract.creatorWallet,
    workerWallet: contract.workerWallet!,
    amount: contract.totalAmount
  });

  return {
    mode,
    action: "fund_contract" as const,
    contractId: contract.id,
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
