import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { getEscrowAdapter, getEscrowAdapterMode } from "@/lib/blockchain/escrow-adapter";
import { recordEvent } from "@/lib/services/events/record-event";
import { assertAllowed, assertFound, assertState } from "@/lib/services/errors";
import { applyMilestoneRelease } from "@/lib/services/milestones/apply-milestone-release";
import { serializeArbitratorContract } from "@/lib/services/contracts/filter-arbitrator-contract";
import {
  assertEscrowTransactionMatches,
  getOrCreateEscrowTransaction
} from "@/lib/services/transactions/escrow-transactions";
import type { ArbitrateDisputeResolutionInput } from "@/lib/validations/proof-submission";

const contractInclude = {
  milestones: {
    orderBy: { index: "asc" as const },
    include: { proofSubmissions: { orderBy: { version: "desc" as const } } }
  },
  events: { orderBy: { createdAt: "desc" as const } },
  disputes: { orderBy: { createdAt: "desc" as const } }
};

export async function arbitrateDisputeResolution(input: ArbitrateDisputeResolutionInput) {
  assertState(getEscrowAdapterMode() === "mock", "On-chain dispute settlement is not available");
  const idempotencyKey = input.idempotencyKey ?? randomUUID();

  return db.$transaction(async (tx) => {
    const contract = assertFound(
      await tx.contract.findUnique({ where: { id: input.contractId } }),
      "Contract not found"
    );
    const milestone = assertFound(
      await tx.milestone.findFirst({ where: { id: input.milestoneId, contractId: contract.id } }),
      "Milestone not found"
    );
    const dispute = assertFound(
      await tx.dispute.findUnique({ where: { milestoneId: milestone.id } }),
      "Dispute not found"
    );

    assertAllowed(
      contract.disputePolicy === "arbitrator" && input.walletAddress === contract.arbitratorWallet,
      "Only the contract's named arbitrator can decide this dispute"
    );

    const release = input.outcome === "release_to_worker";
    const amount = release
      ? milestone.amount
      : contract.fundedAmount.minus(contract.releasedAmount);
    const transactionInput = {
      contractId: contract.id,
      milestoneId: release ? milestone.id : null,
      action: release ? "resolve" as const : "refund" as const,
      mode: "mock" as const,
      walletAddress: input.walletAddress,
      amount,
      idempotencyKey
    };
    const existing = await tx.escrowTransaction.findUnique({ where: { idempotencyKey } });
    if (existing) {
      assertEscrowTransactionMatches(existing, transactionInput);
      if (existing.status === "reconciled") {
        return serializeArbitratorContract(
          await tx.contract.findUniqueOrThrow({ where: { id: contract.id }, include: contractInclude })
        );
      }
    }

    assertState(contract.status === "disputed", "Contract is not disputed");
    assertState(milestone.status === "disputed", "Milestone is not disputed");
    assertState(dispute.status !== "resolved", "Dispute is already resolved");
    assertState(amount.greaterThan(0), "No escrow balance remains to settle");
    const transaction = await getOrCreateEscrowTransaction(tx, transactionInput);
    const adapter = getEscrowAdapter();
    const settlement = release
      ? await adapter.releaseMilestonePayment({
          contractId: contract.id,
          milestoneId: milestone.id,
          creatorWallet: contract.creatorWallet,
          workerWallet: contract.workerWallet!,
          amount
        })
      : await adapter.refundContract({
          contractId: contract.id,
          creatorWallet: contract.creatorWallet,
          workerWallet: contract.workerWallet!,
          amount
        });

    const claimed = await tx.dispute.updateMany({
      where: { id: dispute.id, status: { in: ["open", "proposed"] } },
      data: {
        status: "resolved",
        proposedOutcome: input.outcome,
        proposedBy: null,
        resolvedAt: new Date()
      }
    });
    assertState(claimed.count === 1, "Dispute was already resolved");

    if (release) {
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
      payload: { outcome: input.outcome, authority: "arbitrator" },
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

    return serializeArbitratorContract(
      await tx.contract.findUniqueOrThrow({ where: { id: contract.id }, include: contractInclude })
    );
  });
}
