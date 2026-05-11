import { db } from "@/lib/db";
import { recordEvent } from "@/lib/services/events/record-event";
import { assertAllowed, assertFound, assertState } from "@/lib/services/errors";
import { serializeContractWithProfiles } from "@/lib/services/serialize";
import type { SubmitProofInput } from "@/lib/validations/proof-submission";

export async function submitMilestoneProof(input: SubmitProofInput) {
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
      input.walletAddress === contract.workerWallet,
      "Only the assigned Worker can submit proof"
    );
    assertState(contract.status === "active", "Contract must be active before proof submission");
    assertState(
      milestone.status === "ready" || milestone.status === "revision_requested",
      "Milestone is not ready for proof submission"
    );

    const latestProof = await tx.proofSubmission.findFirst({
      where: { milestoneId: milestone.id },
      orderBy: { version: "desc" }
    });
    const version = (latestProof?.version ?? 0) + 1;

    const proof = await tx.proofSubmission.create({
      data: {
        milestoneId: milestone.id,
        submittedBy: input.walletAddress,
        note: input.note,
        proofUrl: input.proofUrl || null,
        proofHash: input.proofHash || null,
        version
      }
    });

    await tx.milestone.update({
      where: { id: milestone.id },
      data: {
        status: "submitted",
        submittedAt: new Date()
      }
    });

    await recordEvent(tx, {
      contractId: contract.id,
      milestoneId: milestone.id,
      actorWallet: input.walletAddress,
      eventType: "milestone_proof_submitted",
      payload: {
        proofSubmissionId: proof.id,
        version: proof.version,
        proofUrl: proof.proofUrl
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
