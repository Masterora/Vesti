import type { Contract, Milestone, Prisma } from "@prisma/client";
import { recordEvent } from "@/lib/services/events/record-event";

export async function applyMilestoneRelease(
  tx: Prisma.TransactionClient,
  input: {
    contract: Contract;
    milestone: Milestone;
    actorWallet: string;
    txSig: string;
  }
) {
  const nextReleasedAmount = input.contract.releasedAmount.plus(input.milestone.amount);

  await tx.milestone.update({
    where: { id: input.milestone.id },
    data: {
      status: "released",
      releasedAt: new Date()
    }
  });

  const remainingMilestones = await tx.milestone.count({
    where: {
      contractId: input.contract.id,
      NOT: { status: "released" }
    }
  });

  const contractStatus = remainingMilestones === 0 ? "completed" : "active";

  await tx.contract.update({
    where: { id: input.contract.id },
    data: {
      releasedAmount: nextReleasedAmount,
      status: contractStatus
    }
  });

  await recordEvent(tx, {
    contractId: input.contract.id,
    milestoneId: input.milestone.id,
    actorWallet: input.actorWallet,
    eventType: "milestone_released",
    payload: {
      title: input.milestone.title,
      amount: input.milestone.amount.toString()
    },
    txSig: input.txSig
  });

  if (contractStatus === "completed") {
    await recordEvent(tx, {
      contractId: input.contract.id,
      actorWallet: input.actorWallet,
      eventType: "contract_completed",
      payload: {
        releasedAmount: nextReleasedAmount.toString()
      },
      txSig: input.txSig
    });
  }
}
