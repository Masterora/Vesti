import { db } from "@/lib/db";
import { getEscrowAdapter } from "@/lib/blockchain/escrow-adapter";
import { recordEvent } from "@/lib/services/events/record-event";
import { assertAllowed, assertFound, assertState } from "@/lib/services/errors";
import { serializeContract } from "@/lib/services/serialize";
import type { FundContractInput } from "@/lib/validations/contract";

export async function fundContract(input: FundContractInput) {
  const adapter = getEscrowAdapter();

  return db.$transaction(async (tx) => {
    const contract = assertFound(
      await tx.contract.findUnique({
        where: { id: input.contractId },
        include: {
          milestones: {
            orderBy: { index: "asc" }
          }
        }
      }),
      "Contract not found"
    );

    assertAllowed(
      input.walletAddress === contract.creatorWallet,
      "Only the Creator can fund this contract"
    );
    assertState(contract.status === "draft", "Only draft contracts can be funded");

    const escrow = await adapter.fundContract({
      contractId: contract.id,
      creatorWallet: contract.creatorWallet,
      workerWallet: contract.workerWallet,
      amount: contract.totalAmount
    });

    await tx.contract.update({
      where: { id: contract.id },
      data: {
        status: "active",
        fundedAmount: contract.totalAmount,
        escrowAccount: escrow.escrowAccount
      }
    });

    await tx.milestone.updateMany({
      where: { contractId: contract.id, status: "pending" },
      data: { status: "ready" }
    });

    await recordEvent(tx, {
      contractId: contract.id,
      actorWallet: input.walletAddress,
      eventType: "contract_funded",
      payload: {
        amount: contract.totalAmount.toString(),
        escrowAccount: escrow.escrowAccount
      },
      txSig: escrow.txSig
    });

    await recordEvent(tx, {
      contractId: contract.id,
      actorWallet: input.walletAddress,
      eventType: "contract_activated",
      payload: {
        readyMilestones: contract.milestones.length
      },
      txSig: escrow.txSig
    });

    for (const milestone of contract.milestones) {
      await recordEvent(tx, {
        contractId: contract.id,
        milestoneId: milestone.id,
        actorWallet: input.walletAddress,
        eventType: "milestone_ready",
        payload: {
          title: milestone.title,
          amount: milestone.amount.toString()
        },
        txSig: escrow.txSig
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
