import { db } from "@/lib/db";
import { getEscrowAdapterMode } from "@/lib/blockchain/escrow-adapter";
import { reconcileFundEscrowTransaction } from "@/lib/blockchain/solana-escrow-reconciliation";
import { applyContractFunded } from "@/lib/services/contracts/apply-contract-funded";
import { assertAllowed, assertFound, assertState } from "@/lib/services/errors";
import { serializeContract } from "@/lib/services/serialize";
import type { ConfirmFundTransactionInput } from "@/lib/validations/transaction";

export async function confirmFundTransaction(input: ConfirmFundTransactionInput) {
  const mode = getEscrowAdapterMode();

  if (mode === "mock") {
    return {
      mode,
      action: "fund_contract" as const,
      contractId: input.contractId,
      confirmed: false,
      canUseDirectAction: true,
      message: "Mock escrow mode does not confirm wallet-signed transactions."
    };
  }

  const contract = assertFound(
    await db.contract.findUnique({
      where: { id: input.contractId },
      include: {
        milestones: {
          orderBy: { index: "asc" }
        }
      }
    }),
    "Contract not found"
  );

  assertAllowed(
    input.walletAddress === contract.creatorWallet,
    "Only the Creator can confirm funding"
  );
  assertState(contract.status === "draft", "Only draft contracts can be funded");
  assertState(Boolean(contract.workerWallet), "Assigned Worker wallet is required before funding");

  const reconciliation = await reconcileFundEscrowTransaction({
    txSig: input.txSig,
    contractId: contract.id,
    creatorWallet: contract.creatorWallet,
    workerWallet: contract.workerWallet!,
    totalAmount: contract.totalAmount
  });

  return db.$transaction(async (tx) => {
    const currentContract = assertFound(
      await tx.contract.findUnique({
        where: { id: contract.id },
        include: {
          milestones: {
            orderBy: { index: "asc" }
          }
        }
      }),
      "Contract not found"
    );

    assertState(currentContract.status === "draft", "Only draft contracts can be funded");

    await applyContractFunded(tx, {
      contract: currentContract,
      actorWallet: input.walletAddress,
      escrowAccount: reconciliation.escrowAccount,
      txSig: input.txSig
    });

    const updated = await tx.contract.findUniqueOrThrow({
      where: { id: contract.id },
      include: {
        milestones: {
          orderBy: { index: "asc" },
          include: {
            proofSubmissions: {
              orderBy: { version: "desc" }
            }
          }
        },
        events: {
          orderBy: { createdAt: "desc" }
        }
      }
    });

    return {
      mode,
      action: "fund_contract" as const,
      confirmed: true,
      confirmation: reconciliation.confirmation,
      contract: serializeContract(updated)
    };
  });
}
