import { db } from "@/lib/db";
import { getEscrowAdapterMode } from "@/lib/blockchain/escrow-adapter";
import { reconcileReleaseEscrowTransaction } from "@/lib/blockchain/solana-escrow-reconciliation";
import { applyMilestoneRelease } from "@/lib/services/milestones/apply-milestone-release";
import { assertAllowed, assertFound, assertState } from "@/lib/services/errors";
import { serializeContractWithProfiles } from "@/lib/services/serialize";
import { submitEscrowTransaction } from "@/lib/services/transactions/submit-escrow-transaction";
import type { ConfirmReleaseTransactionInput } from "@/lib/validations/transaction";

const contractInclude = {
  milestones: {
    orderBy: { index: "asc" as const },
    include: { proofSubmissions: { orderBy: { version: "desc" as const } } }
  },
  events: { orderBy: { createdAt: "desc" as const } }
};

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
    await db.contract.findUnique({ where: { id: input.contractId } }),
    "Contract not found"
  );
  const milestone = assertFound(
    await db.milestone.findFirst({ where: { id: input.milestoneId, contractId: contract.id } }),
    "Milestone not found"
  );
  assertAllowed(input.walletAddress === contract.creatorWallet, "Only the Creator can confirm payment release");

  const transaction = assertFound(
    await db.escrowTransaction.findUnique({ where: { id: input.transactionId } }),
    "Prepared release transaction not found"
  );
  assertState(transaction.contractId === contract.id, "Prepared transaction belongs to another contract");
  assertState(transaction.milestoneId === milestone.id, "Prepared transaction belongs to another milestone");
  assertState(transaction.action === "release", "Prepared transaction is not a release transaction");
  assertState(transaction.mode === "onchain", "Prepared transaction is not an on-chain transaction");
  assertState(transaction.walletAddress === input.walletAddress, "Prepared transaction belongs to another wallet");

  if (transaction.status === "reconciled") {
    return {
      mode,
      action: "release_milestone" as const,
      confirmed: true,
      contract: await serializeContractWithProfiles(
        await db.contract.findUniqueOrThrow({ where: { id: contract.id }, include: contractInclude })
      )
    };
  }

  assertState(["prepared", "submitted"].includes(transaction.status), "Release transaction cannot be confirmed");
  assertState(contract.status === "active", "Contract must be active before release");
  assertState(Boolean(contract.workerWallet), "Assigned Worker wallet is required before release");
  assertState(milestone.status === "approved", "Only approved milestones can be released");
  assertState(
    contract.releasedAmount.plus(milestone.amount).lessThanOrEqualTo(contract.fundedAmount),
    "Released amount cannot exceed funded amount"
  );

  await submitEscrowTransaction({
    contractId: contract.id,
    milestoneId: milestone.id,
    walletAddress: input.walletAddress,
    transactionId: transaction.id,
    txSig: input.txSig
  });

  const reconciliation = await reconcileReleaseEscrowTransaction({
    txSig: input.txSig,
    contractId: contract.id,
    milestoneId: milestone.id,
    creatorWallet: contract.creatorWallet,
    workerWallet: contract.workerWallet!,
    fundedAmount: contract.fundedAmount,
    releasedAmountBefore: contract.releasedAmount,
    milestoneAmount: milestone.amount
  });

  return db.$transaction(async (tx) => {
    const currentTransaction = await tx.escrowTransaction.findUniqueOrThrow({
      where: { id: transaction.id }
    });
    if (currentTransaction.status === "reconciled") {
      return {
        mode,
        action: "release_milestone" as const,
        confirmed: true,
        contract: await serializeContractWithProfiles(
          await tx.contract.findUniqueOrThrow({ where: { id: contract.id }, include: contractInclude })
        )
      };
    }

    const currentContract = assertFound(
      await tx.contract.findUnique({ where: { id: contract.id } }),
      "Contract not found"
    );
    const currentMilestone = assertFound(
      await tx.milestone.findFirst({ where: { id: milestone.id, contractId: contract.id } }),
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
    await tx.escrowTransaction.update({
      where: { id: transaction.id },
      data: {
        status: "reconciled",
        confirmedAt: new Date(),
        reconciledAt: new Date(),
        errorCode: null,
        errorMessage: null,
        nextAttemptAt: null,
        requiresReviewAt: null,
        reconciliationLeaseId: null,
        reconciliationLeaseExpiresAt: null
      }
    });

    return {
      mode,
      action: "release_milestone" as const,
      confirmed: true,
      confirmation: reconciliation.confirmation,
      contract: await serializeContractWithProfiles(
        await tx.contract.findUniqueOrThrow({ where: { id: contract.id }, include: contractInclude })
      )
    };
  });
}
