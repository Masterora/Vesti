import { db } from "@/lib/db";
import { getEscrowAdapterMode } from "@/lib/blockchain/escrow-adapter";
import { reconcileReleaseEscrowTransaction } from "@/lib/blockchain/solana-escrow-reconciliation";
import { applyMilestoneRelease } from "@/lib/services/milestones/apply-milestone-release";
import { assertAllowed, assertFound, assertState } from "@/lib/services/errors";
import { serializeContract } from "@/lib/services/serialize";
import type { ConfirmReleaseTransactionInput } from "@/lib/validations/transaction";

export async function confirmReleaseTransaction(input: ConfirmReleaseTransactionInput) {
  const mode = getEscrowAdapterMode();

  if (mode === "mock") {
    return {
      mode,
      action: "release_milestone" as const,
      contractId: input.contractId,
      milestoneId: input.milestoneId,
      confirmed: false,
      canUseDirectAction: true,
      message: "Mock escrow mode does not confirm wallet-signed transactions."
    };
  }

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
    "Only the Creator can confirm payment release"
  );
  assertState(contract.status === "active", "Contract must be active before release");
  assertState(milestone.status === "approved", "Only approved milestones can be released");

  const nextReleasedAmount = contract.releasedAmount.plus(milestone.amount);
  assertState(
    nextReleasedAmount.lessThanOrEqualTo(contract.fundedAmount),
    "Released amount cannot exceed funded amount"
  );

  const reconciliation = await reconcileReleaseEscrowTransaction({
    txSig: input.txSig,
    contractId: contract.id,
    milestoneId: milestone.id,
    creatorWallet: contract.creatorWallet,
    workerWallet: contract.workerWallet,
    fundedAmount: contract.fundedAmount,
    releasedAmountBefore: contract.releasedAmount,
    milestoneAmount: milestone.amount
  });

  return db.$transaction(async (tx) => {
    const currentContract = assertFound(
      await tx.contract.findUnique({
        where: { id: contract.id }
      }),
      "Contract not found"
    );
    const currentMilestone = assertFound(
      await tx.milestone.findFirst({
        where: {
          id: milestone.id,
          contractId: contract.id
        }
      }),
      "Milestone not found"
    );

    assertState(currentContract.status === "active", "Contract must be active before release");
    assertState(currentMilestone.status === "approved", "Only approved milestones can be released");
    assertState(
      currentContract.releasedAmount.plus(currentMilestone.amount).lessThanOrEqualTo(currentContract.fundedAmount),
      "Released amount cannot exceed funded amount"
    );

    await applyMilestoneRelease(tx, {
      contract: currentContract,
      milestone: currentMilestone,
      actorWallet: input.walletAddress,
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
      action: "release_milestone" as const,
      confirmed: true,
      confirmation: reconciliation.confirmation,
      contract: serializeContract(updated)
    };
  });
}
