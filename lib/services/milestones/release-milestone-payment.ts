import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { getEscrowAdapter, getEscrowAdapterMode } from "@/lib/blockchain/escrow-adapter";
import { applyMilestoneRelease } from "@/lib/services/milestones/apply-milestone-release";
import { assertAllowed, assertFound, assertState } from "@/lib/services/errors";
import { serializeContractWithProfiles } from "@/lib/services/serialize";
import {
  assertEscrowTransactionMatches,
  getOrCreateEscrowTransaction
} from "@/lib/services/transactions/escrow-transactions";
import type { ReleaseMilestoneInput } from "@/lib/validations/proof-submission";

const contractInclude = {
  milestones: {
    orderBy: { index: "asc" as const },
    include: { proofSubmissions: { orderBy: { version: "desc" as const } } }
  },
  events: { orderBy: { createdAt: "desc" as const } }
};

export async function releaseMilestonePayment(input: ReleaseMilestoneInput) {
  const mode = getEscrowAdapterMode();
  assertState(mode === "mock", "Use the wallet-signed release flow in on-chain mode");
  const idempotencyKey = input.idempotencyKey ?? randomUUID();

  const contract = assertFound(
    await db.contract.findUnique({ where: { id: input.contractId } }),
    "Contract not found"
  );
  const milestone = assertFound(
    await db.milestone.findFirst({
      where: { id: input.milestoneId, contractId: contract.id }
    }),
    "Milestone not found"
  );

  assertAllowed(input.walletAddress === contract.creatorWallet, "Only the Creator can release payments");

  const existingTransaction = await db.escrowTransaction.findUnique({ where: { idempotencyKey } });
  if (existingTransaction) {
    assertEscrowTransactionMatches(existingTransaction, {
      contractId: contract.id,
      milestoneId: milestone.id,
      action: "release",
      mode,
      walletAddress: input.walletAddress,
      amount: milestone.amount,
      idempotencyKey
    });
    if (existingTransaction.status === "reconciled") {
      return serializeContractWithProfiles(
        await db.contract.findUniqueOrThrow({ where: { id: contract.id }, include: contractInclude })
      );
    }
  }

  assertState(contract.status === "active", "Contract must be active before release");
  assertState(Boolean(contract.workerWallet), "Assigned Worker wallet is required before release");
  assertState(milestone.status === "approved", "Only approved milestones can be released");
  assertState(
    contract.releasedAmount.plus(milestone.amount).lessThanOrEqualTo(contract.fundedAmount),
    "Released amount cannot exceed funded amount"
  );

  const transaction = await db.$transaction((tx) =>
    getOrCreateEscrowTransaction(tx, {
      contractId: contract.id,
      milestoneId: milestone.id,
      action: "release",
      mode,
      walletAddress: input.walletAddress,
      amount: milestone.amount,
      idempotencyKey
    })
  );

  const release = await getEscrowAdapter().releaseMilestonePayment({
    contractId: contract.id,
    milestoneId: milestone.id,
    creatorWallet: contract.creatorWallet,
    workerWallet: contract.workerWallet!,
    amount: milestone.amount
  });

  return db.$transaction(async (tx) => {
    const currentTransaction = await tx.escrowTransaction.findUniqueOrThrow({
      where: { id: transaction.id }
    });
    if (currentTransaction.status === "reconciled") {
      return serializeContractWithProfiles(
        await tx.contract.findUniqueOrThrow({ where: { id: contract.id }, include: contractInclude })
      );
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
      txSig: release.txSig
    });
    await tx.escrowTransaction.update({
      where: { id: transaction.id },
      data: {
        txSig: release.txSig,
        status: "reconciled",
        submittedAt: new Date(),
        confirmedAt: new Date(),
        reconciledAt: new Date()
      }
    });

    return serializeContractWithProfiles(
      await tx.contract.findUniqueOrThrow({ where: { id: contract.id }, include: contractInclude })
    );
  });
}
