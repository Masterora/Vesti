import { db } from "@/lib/db";
import { recordEvent } from "@/lib/services/events/record-event";
import { assertAllowed, assertFound, assertState } from "@/lib/services/errors";
import { serializeContract } from "@/lib/services/serialize";
import type { RequestRevisionInput } from "@/lib/validations/proof-submission";

export async function requestMilestoneRevision(input: RequestRevisionInput) {
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
      input.walletAddress === contract.creatorWallet,
      "Only the Creator can request milestone revisions"
    );
    assertState(contract.status === "active", "Contract must be active before revision requests");
    assertState(
      milestone.status === "submitted",
      "Only submitted milestones can be sent back for revision"
    );

    await tx.milestone.update({
      where: { id: milestone.id },
      data: {
        status: "revision_requested"
      }
    });

    await recordEvent(tx, {
      contractId: contract.id,
      milestoneId: milestone.id,
      actorWallet: input.walletAddress,
      eventType: "milestone_revision_requested",
      payload: {
        title: milestone.title,
        note: input.note
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

    return serializeContract(updated);
  });
}
