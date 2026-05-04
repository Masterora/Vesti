import { db } from "@/lib/db";
import { getEscrowAdapter } from "@/lib/blockchain/escrow-adapter";
import { recordEvent } from "@/lib/services/events/record-event";
import { assertAllowed, assertFound, assertState } from "@/lib/services/errors";
import { serializeContract } from "@/lib/services/serialize";
import type { ReleaseMilestoneInput } from "@/lib/validations/proof-submission";

export async function releaseMilestonePayment(input: ReleaseMilestoneInput) {
  const adapter = getEscrowAdapter();

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
      "Only the Creator can release payments"
    );
    assertState(contract.status === "active", "Contract must be active before release");
    assertState(milestone.status === "approved", "Only approved milestones can be released");

    const nextReleasedAmount = contract.releasedAmount.plus(milestone.amount);
    assertState(
      nextReleasedAmount.lessThanOrEqualTo(contract.fundedAmount),
      "Released amount cannot exceed funded amount"
    );

    const release = await adapter.releaseMilestonePayment({
      contractId: contract.id,
      milestoneId: milestone.id,
      creatorWallet: contract.creatorWallet,
      workerWallet: contract.workerWallet,
      amount: milestone.amount
    });

    await tx.milestone.update({
      where: { id: milestone.id },
      data: {
        status: "released",
        releasedAt: new Date()
      }
    });

    const remainingMilestones = await tx.milestone.count({
      where: {
        contractId: contract.id,
        NOT: { status: "released" }
      }
    });

    const contractStatus = remainingMilestones === 0 ? "completed" : "active";

    await tx.contract.update({
      where: { id: contract.id },
      data: {
        releasedAmount: nextReleasedAmount,
        status: contractStatus
      }
    });

    await recordEvent(tx, {
      contractId: contract.id,
      milestoneId: milestone.id,
      actorWallet: input.walletAddress,
      eventType: "milestone_released",
      payload: {
        title: milestone.title,
        amount: milestone.amount.toString()
      },
      txSig: release.txSig
    });

    if (contractStatus === "completed") {
      await recordEvent(tx, {
        contractId: contract.id,
        actorWallet: input.walletAddress,
        eventType: "contract_completed",
        payload: {
          releasedAmount: nextReleasedAmount.toString()
        },
        txSig: release.txSig
      });
    }

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
