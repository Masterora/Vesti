import {
  lockContract,
  advanceBusinessRevision,
} from "@/lib/services/contracts/contract-lock";
import { db } from "@/lib/db";
import { getEscrowAdapterMode } from "@/lib/blockchain/escrow-adapter";
import { recordEvent } from "@/lib/services/events/record-event";
import { assertAllowed, assertFound, assertState } from "@/lib/services/errors";
import { serializeParticipantContract } from "@/lib/services/contracts/filter-worker-contract";
import type { ProposeDisputeResolutionInput } from "@/lib/validations/proof-submission";

export async function proposeDisputeResolution(
  input: ProposeDisputeResolutionInput,
) {
  assertState(
    getEscrowAdapterMode() === "mock",
    "On-chain dispute settlement is not available",
  );

  return db.$transaction(async (tx) => {
    await lockContract(tx, input.contractId, true);
    await advanceBusinessRevision(tx, input.contractId);
    const contract = assertFound(
      await tx.contract.findUnique({ where: { id: input.contractId } }),
      "Contract not found",
    );
    const dispute = assertFound(
      await tx.dispute.findUnique({
        where: { milestoneId: input.milestoneId },
      }),
      "Dispute not found",
    );

    assertState(
      dispute.contractId === contract.id,
      "Dispute belongs to another contract",
    );
    assertAllowed(
      input.walletAddress === contract.creatorWallet ||
        input.walletAddress === contract.workerWallet,
      "Only the Creator or Worker can propose a dispute resolution",
    );
    assertState(contract.status === "disputed", "Contract is not disputed");
    assertState(dispute.status !== "resolved", "Dispute is already resolved");
    assertState(dispute.proposalVersion.toString() === input.expectedProposalVersion,
      "Proposal version changed; refresh and retry");

    await tx.dispute.update({
      where: { id: dispute.id },
      data: {
        status: "proposed",
        proposedOutcome: input.outcome,
        proposedBy: input.walletAddress,
        proposalVersion: { increment: BigInt(1) },
      },
    });
    await recordEvent(tx, {
      contractId: contract.id,
      milestoneId: dispute.milestoneId,
      actorWallet: input.walletAddress,
      eventType: "dispute_resolution_proposed",
      payload: { outcome: input.outcome },
    });

    return serializeParticipantContract(
      await tx.contract.findUniqueOrThrow({
        where: { id: contract.id },
        include: {
          milestones: {
            orderBy: { index: "asc" },
            include: { proofSubmissions: { orderBy: { version: "desc" } } },
          },
          events: { orderBy: { createdAt: "desc" } },
          disputes: { orderBy: { createdAt: "desc" } },
        },
      }),
      input.walletAddress,
    );
  });
}
