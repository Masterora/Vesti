import { db } from "@/lib/db";
import { recordEvent } from "@/lib/services/events/record-event";
import { assertAllowed, assertFound, assertState } from "@/lib/services/errors";
import { serializeContractWithProfiles } from "@/lib/services/serialize";
import type { DisputeMilestoneInput } from "@/lib/validations/proof-submission";

const disputableMilestoneStatuses = ["ready", "submitted", "revision_requested", "approved"];

export async function disputeMilestone(input: DisputeMilestoneInput) {
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

    await tx.contract.update({
      where: { id: contract.id },
      data: {
        status: "disputed"
      }
    });

    await tx.milestone.update({
      where: { id: milestone.id },
      data: {
        status: "disputed"
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
        }
      }
    });

    return serializeContractWithProfiles(updated);
  });
}
