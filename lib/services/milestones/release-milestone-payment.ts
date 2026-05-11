import { db } from "@/lib/db";
import { getEscrowAdapter } from "@/lib/blockchain/escrow-adapter";
import { applyMilestoneRelease } from "@/lib/services/milestones/apply-milestone-release";
import { assertAllowed, assertFound, assertState } from "@/lib/services/errors";
import { serializeContractWithProfiles } from "@/lib/services/serialize";
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
    assertState(Boolean(contract.workerWallet), "Assigned Worker wallet is required before release");
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
      workerWallet: contract.workerWallet!,
      amount: milestone.amount
    });

    await applyMilestoneRelease(tx, {
      contract,
      milestone,
      actorWallet: input.walletAddress,
      txSig: release.txSig
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
