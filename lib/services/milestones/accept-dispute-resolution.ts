import {
  lockContract,
  advanceBusinessRevision,
} from "@/lib/services/contracts/contract-lock";
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import {
  getEscrowAdapter,
  getEscrowAdapterMode,
} from "@/lib/blockchain/escrow-adapter";
import { recordEvent } from "@/lib/services/events/record-event";
import { assertAllowed, assertFound, assertState } from "@/lib/services/errors";
import { applyMilestoneRelease } from "@/lib/services/milestones/apply-milestone-release";
import { serializeParticipantContract } from "@/lib/services/contracts/filter-worker-contract";
import {
  assertEscrowTransactionMatches,
  getOrCreateEscrowTransaction,
} from "@/lib/services/transactions/escrow-transactions";
import type { AcceptDisputeResolutionInput } from "@/lib/validations/proof-submission";

const contractInclude = {
  milestones: {
    orderBy: { index: "asc" as const },
    include: { proofSubmissions: { orderBy: { version: "desc" as const } } },
  },
  events: { orderBy: { createdAt: "desc" as const } },
  disputes: { orderBy: { createdAt: "desc" as const } },
};

export async function acceptDisputeResolution(
  input: AcceptDisputeResolutionInput,
) {
  const mode = getEscrowAdapterMode();
  assertState(mode === "mock", "On-chain dispute settlement is not available");
  const idempotencyKey = input.idempotencyKey ?? randomUUID();

  return db.$transaction(async (tx) => {
    await lockContract(tx, input.contractId);
    const contract = assertFound(
      await tx.contract.findUnique({ where: { id: input.contractId } }),
      "Contract not found",
    );
    const milestone = assertFound(
      await tx.milestone.findFirst({
        where: { id: input.milestoneId, contractId: contract.id },
      }),
      "Milestone not found",
    );
    const dispute = assertFound(
      await tx.dispute.findUnique({ where: { milestoneId: milestone.id } }),
      "Dispute not found",
    );

    assertAllowed(
      input.walletAddress === contract.creatorWallet ||
        input.walletAddress === contract.workerWallet,
      "Only the Creator or Worker can accept a dispute resolution",
    );
    assertState(
      dispute.proposedBy !== input.walletAddress,
      "The other participant must accept the proposal",
    );
    assertState(
      Boolean(dispute.proposedOutcome),
      "Dispute resolution outcome is missing",
    );
    assertState(dispute.proposalVersion.toString() === input.expectedProposalVersion &&
      dispute.proposedOutcome === input.expectedOutcome,
      "Proposal changed; refresh and retry");

    const action =
      dispute.proposedOutcome === "release_to_worker" ? "resolve" : "refund";
    const amount =
      dispute.proposedOutcome === "release_to_worker"
        ? milestone.amount
        : contract.fundedAmount.minus(contract.releasedAmount);
    const transactionInput = {
      contractId: contract.id,
      milestoneId:
        dispute.proposedOutcome === "release_to_worker" ? milestone.id : null,
      action,
      mode,
      walletAddress: input.walletAddress,
      amount,
      idempotencyKey,
    } as const;
    const existingTransaction = await tx.escrowTransaction.findUnique({
      where: { idempotencyKey },
    });

    if (existingTransaction) {
      assertEscrowTransactionMatches(existingTransaction, transactionInput);
      const context = existingTransaction.operationContext as { proposalVersion?: string; outcome?: string } | null;
      assertState(context?.proposalVersion === input.expectedProposalVersion && context?.outcome === input.expectedOutcome,
        "Idempotency proposal changed");
      if (existingTransaction.status === "reconciled") {
        return serializeParticipantContract(
          await tx.contract.findUniqueOrThrow({
            where: { id: contract.id },
            include: contractInclude,
          }),
          input.walletAddress,
        );
      }
    }

    assertState(dispute.status === "proposed", "Dispute has no pending resolution proposal");
    await advanceBusinessRevision(tx, input.contractId);

    assertState(contract.status === "disputed", "Contract is not disputed");
    assertState(milestone.status === "disputed", "Milestone is not disputed");
    const transaction = await getOrCreateEscrowTransaction(
      tx,
      transactionInput,
    );
    await tx.escrowTransaction.update({ where: { id: transaction.id }, data: {
      operationContext: { proposalVersion: input.expectedProposalVersion, outcome: input.expectedOutcome },
    } });
    const adapter = getEscrowAdapter();
    const settlement =
      dispute.proposedOutcome === "release_to_worker"
        ? await adapter.releaseMilestonePayment({
            contractId: contract.id,
            milestoneId: milestone.id,
            creatorWallet: contract.creatorWallet,
            workerWallet: contract.workerWallet!,
            amount: milestone.amount,
          })
        : await adapter.refundContract({
            contractId: contract.id,
            creatorWallet: contract.creatorWallet,
            workerWallet: contract.workerWallet!,
            amount,
          });

    {
      const claimed = await tx.dispute.updateMany({
        where: {
          id: dispute.id,
          status: "proposed",
          proposedBy: dispute.proposedBy,
          proposalVersion: BigInt(input.expectedProposalVersion),
          proposedOutcome: input.expectedOutcome,
        },
        data: { status: "resolved", resolvedAt: new Date() },
      });
      assertState(
        claimed.count === 1,
        "Dispute resolution was already applied",
      );

      if (dispute.proposedOutcome === "release_to_worker") {
        const restored = await tx.milestone.updateMany({
          where: { id: milestone.id, status: "disputed" },
          data: { status: "approved" },
        });
        assertState(restored.count === 1, "Disputed milestone state changed");
        await applyMilestoneRelease(tx, {
          contract,
          milestone: { ...milestone, status: "approved" },
          actorWallet: input.walletAddress,
          txSig: settlement.txSig,
        });
      } else {
        const cancelled = await tx.contract.updateMany({
          where: { id: contract.id, status: "disputed" },
          data: { status: "cancelled", refundedAmount: amount },
        });
        assertState(cancelled.count === 1, "Disputed contract state changed");
        await recordEvent(tx, {
          contractId: contract.id,
          milestoneId: milestone.id,
          actorWallet: input.walletAddress,
          eventType: "contract_refunded",
          payload: { amount: amount.toString() },
          txSig: settlement.txSig,
        });
      }

      await recordEvent(tx, {
        contractId: contract.id,
        milestoneId: milestone.id,
        actorWallet: input.walletAddress,
        eventType: "contract_dispute_resolved",
        payload: { outcome: dispute.proposedOutcome },
        txSig: settlement.txSig,
      });
      await tx.escrowTransaction.update({
        where: { id: transaction.id },
        data: {
          txSig: settlement.txSig,
          status: "reconciled",
          submittedAt: new Date(),
          confirmedAt: new Date(),
          reconciledAt: new Date(),
        },
      });

      return serializeParticipantContract(
        await tx.contract.findUniqueOrThrow({
          where: { id: contract.id },
          include: contractInclude,
        }),
        input.walletAddress,
      );
    }
  });
}
