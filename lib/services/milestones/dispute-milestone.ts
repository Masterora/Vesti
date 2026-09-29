import { db } from "@/lib/db";
import { getEscrowAdapterMode } from "@/lib/blockchain/escrow-adapter";
import { recordEvent } from "@/lib/services/events/record-event";
import { assertAllowed, assertFound, assertState } from "@/lib/services/errors";
import { serializeParticipantContract } from "@/lib/services/contracts/filter-worker-contract";
import type { DisputeMilestoneInput } from "@/lib/validations/proof-submission";

const disputableMilestoneStatuses = ["ready", "submitted", "revision_requested", "approved"];

export async function disputeMilestone(input: DisputeMilestoneInput) {
  assertState(
    getEscrowAdapterMode() === "mock",
    "On-chain disputes are disabled until on-chain settlement is available"
  );

  return db.$transaction(async (tx) => {
    const contract = assertFound(
      await tx.contract.findUnique({
        where: { id: input.contractId }
      }),
      "Contract not found"
    );

    const milestone = assertFound(
      await tx.milestone.findFirst({
        where: {
          id: input.milestoneId,
          contractId: contract.id
        }
      }),
      "Milestone not found"
    );

    assertAllowed(
      input.walletAddress === contract.creatorWallet || input.walletAddress === contract.workerWallet,
      "Only the Creator or Worker can open a dispute"
    );
    assertState(contract.status === "active", "Only active contracts can enter dispute");
    assertState(
      disputableMilestoneStatuses.includes(milestone.status),
      "This milestone cannot enter dispute from its current status"
    );

    const claimedContract = await tx.contract.updateMany({
      where: { id: contract.id, status: "active" },
      data: {
        status: "disputed"
      }
    });
    assertState(claimedContract.count === 1, "Contract dispute was already opened");

    const claimedMilestone = await tx.milestone.updateMany({
      where: { id: milestone.id, status: milestone.status },
      data: {
        status: "disputed"
      }
    });
    assertState(claimedMilestone.count === 1, "Milestone dispute was already opened");

    await tx.dispute.create({
      data: {
        contractId: contract.id,
        milestoneId: milestone.id,
        openedBy: input.walletAddress,
        reason: input.reason,
        previousMilestoneStatus: milestone.status
      }
    });

    await recordEvent(tx, {
      contractId: contract.id,
      milestoneId: milestone.id,
      actorWallet: input.walletAddress,
      eventType: "contract_disputed",
      payload: {
        title: milestone.title,
        reason: input.reason
      }
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
        },
        disputes: {
          orderBy: { createdAt: "desc" }
        }
      }
    });

    return serializeParticipantContract(updated, input.walletAddress);
  });
}
