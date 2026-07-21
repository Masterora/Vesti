import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { getEscrowAdapter, getEscrowAdapterMode } from "@/lib/blockchain/escrow-adapter";
import { recordEvent } from "@/lib/services/events/record-event";
import { assertAllowed, assertFound, assertState } from "@/lib/services/errors";
import { applyMilestoneRelease } from "@/lib/services/milestones/apply-milestone-release";
import { serializeContractWithProfiles } from "@/lib/services/serialize";
import {
  assertEscrowTransactionMatches,
  getOrCreateEscrowTransaction
} from "@/lib/services/transactions/escrow-transactions";
import type { AcceptDisputeResolutionInput } from "@/lib/validations/proof-submission";

const contractInclude = {
  milestones: {
    orderBy: { index: "asc" as const },
    include: { proofSubmissions: { orderBy: { version: "desc" as const } } }
  },
  events: { orderBy: { createdAt: "desc" as const } },
  disputes: { orderBy: { createdAt: "desc" as const } }
};

export async function acceptDisputeResolution(input: AcceptDisputeResolutionInput) {
  const mode = getEscrowAdapterMode();
  assertState(mode === "mock", "On-chain dispute settlement is not available");
  const idempotencyKey = input.idempotencyKey ?? randomUUID();

  const contract = assertFound(
    await db.contract.findUnique({ where: { id: input.contractId } }),
    "Contract not found"
  );
  const milestone = assertFound(
    await db.milestone.findFirst({ where: { id: input.milestoneId, contractId: contract.id } }),
    "Milestone not found"
  );
  const dispute = assertFound(
    await db.dispute.findUnique({ where: { milestoneId: milestone.id } }),
    "Dispute not found"
  );

  assertAllowed(
    input.walletAddress === contract.creatorWallet || input.walletAddress === contract.workerWallet,
    "Only the Creator or Worker can accept a dispute resolution"
  );
  assertState(dispute.status === "proposed", "Dispute has no pending resolution proposal");
  assertState(dispute.proposedBy !== input.walletAddress, "The other participant must accept the proposal");
  assertState(Boolean(dispute.proposedOutcome), "Dispute resolution outcome is missing");

  const action = dispute.proposedOutcome === "release_to_worker" ? "resolve" : "refund";
  const amount =
    dispute.proposedOutcome === "release_to_worker"
      ? milestone.amount
      : contract.fundedAmount.minus(contract.releasedAmount);
  const transactionInput = {
    contractId: contract.id,
    milestoneId: dispute.proposedOutcome === "release_to_worker" ? milestone.id : null,
    action,
    mode,
    walletAddress: input.walletAddress,
    amount,
    idempotencyKey
  } as const;
  const existingTransaction = await db.escrowTransaction.findUnique({ where: { idempotencyKey } });

  if (existingTransaction) {
    assertEscrowTransactionMatches(existingTransaction, transactionInput);
    if (existingTransaction.status === "reconciled") {
      return serializeContractWithProfiles(
        await db.contract.findUniqueOrThrow({ where: { id: contract.id }, include: contractInclude })
      );
    }
  }

  assertState(contract.status === "disputed", "Contract is not disputed");
  assertState(milestone.status === "disputed", "Milestone is not disputed");
  const transaction = await db.$transaction((tx) =>
    getOrCreateEscrowTransaction(tx, transactionInput)
  );
  const adapter = getEscrowAdapter();
  const settlement =
    dispute.proposedOutcome === "release_to_worker"
      ? await adapter.releaseMilestonePayment({
          contractId: contract.id,
          milestoneId: milestone.id,
          creatorWallet: contract.creatorWallet,
          workerWallet: contract.workerWallet!,
          amount: milestone.amount
        })
      : await adapter.refundContract({
          contractId: contract.id,
          creatorWallet: contract.creatorWallet,
          workerWallet: contract.workerWallet!,
          amount
        });

  return db.$transaction(async (tx) => {
    const claimed = await tx.dispute.updateMany({
      where: { id: dispute.id, status: "proposed", proposedBy: dispute.proposedBy },
      data: { status: "resolved", resolvedAt: new Date() }
    });
    assertState(claimed.count === 1, "Dispute resolution was already applied");

    if (dispute.proposedOutcome === "release_to_worker") {
      const restored = await tx.milestone.updateMany({
        where: { id: milestone.id, status: "disputed" },
        data: { status: "approved" }
      });
      assertState(restored.count === 1, "Disputed milestone state changed");
      await applyMilestoneRelease(tx, {
        contract,
        milestone: { ...milestone, status: "approved" },
        actorWallet: input.walletAddress,
        txSig: settlement.txSig
      });
    } else {
      const cancelled = await tx.contract.updateMany({
        where: { id: contract.id, status: "disputed" },
        data: { status: "cancelled", refundedAmount: amount }
      });
      assertState(cancelled.count === 1, "Disputed contract state changed");
      await recordEvent(tx, {
        contractId: contract.id,
        milestoneId: milestone.id,
        actorWallet: input.walletAddress,
        eventType: "contract_refunded",
        payload: { amount: amount.toString() },
        txSig: settlement.txSig
      });
    }

    await recordEvent(tx, {
      contractId: contract.id,
      milestoneId: milestone.id,
      actorWallet: input.walletAddress,
      eventType: "contract_dispute_resolved",
      payload: { outcome: dispute.proposedOutcome },
      txSig: settlement.txSig
    });
    await tx.escrowTransaction.update({
      where: { id: transaction.id },
      data: {
        txSig: settlement.txSig,
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
