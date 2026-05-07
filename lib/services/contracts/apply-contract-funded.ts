import type { Contract, Milestone, Prisma } from "@prisma/client";
import { recordEvent } from "@/lib/services/events/record-event";

type ContractWithMilestones = Contract & {
  milestones: Milestone[];
};

export async function applyContractFunded(
  tx: Prisma.TransactionClient,
  input: {
    contract: ContractWithMilestones;
    actorWallet: string;
    escrowAccount: string;
    txSig: string;
  }
) {
  await tx.contract.update({
    where: { id: input.contract.id },
    data: {
      status: "active",
      fundedAmount: input.contract.totalAmount,
      escrowAccount: input.escrowAccount
    }
  });

  await tx.milestone.updateMany({
    where: { contractId: input.contract.id, status: "pending" },
    data: { status: "ready" }
  });

  await recordEvent(tx, {
    contractId: input.contract.id,
    actorWallet: input.actorWallet,
    eventType: "contract_funded",
    payload: {
      amount: input.contract.totalAmount.toString(),
      escrowAccount: input.escrowAccount
    },
    txSig: input.txSig
  });

  await recordEvent(tx, {
    contractId: input.contract.id,
    actorWallet: input.actorWallet,
    eventType: "contract_activated",
    payload: {
      readyMilestones: input.contract.milestones.length
    },
    txSig: input.txSig
  });

  for (const milestone of input.contract.milestones) {
    await recordEvent(tx, {
      contractId: input.contract.id,
      milestoneId: milestone.id,
      actorWallet: input.actorWallet,
      eventType: "milestone_ready",
      payload: {
        title: milestone.title,
        amount: milestone.amount.toString()
      },
      txSig: input.txSig
    });
  }
}
