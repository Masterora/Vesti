import { db } from "@/lib/db";
import { getEscrowAdapterMode } from "@/lib/blockchain/escrow-adapter";
import { prepareReleaseEscrowTransaction } from "@/lib/blockchain/solana-escrow-transactions";
import { assertAllowed, assertFound, assertState } from "@/lib/services/errors";
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

  const mode = getEscrowAdapterMode();

  if (mode === "mock") {
    return {
      mode,
      action: "release_milestone" as const,
      contractId: contract.id,
      milestoneId: milestone.id,
      transaction: null,
      canUseDirectAction: true,
      message: "Mock escrow mode does not require a wallet-signed transaction."
    };
  }

  const prepared = await prepareReleaseEscrowTransaction({
    contractId: contract.id,
    milestoneId: milestone.id,
    creatorWallet: contract.creatorWallet,
    workerWallet: contract.workerWallet!,
    amount: milestone.amount
  });

  return {
    mode,
    action: "release_milestone" as const,
    contractId: contract.id,
    milestoneId: milestone.id,
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
