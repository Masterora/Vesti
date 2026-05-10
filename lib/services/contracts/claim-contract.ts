import { db } from "@/lib/db";
import { recordEvent } from "@/lib/services/events/record-event";
import { assertAllowed, assertFound, assertState } from "@/lib/services/errors";
import { serializeContract } from "@/lib/services/serialize";
import type { ClaimContractInput } from "@/lib/validations/contract";

export async function claimContract(input: ClaimContractInput) {
  return db.$transaction(async (tx) => {
    const contract = assertFound(
      await tx.contract.findUnique({
        where: { id: input.contractId }
      }),
      "Contract not found"
    );

    assertAllowed(
      input.walletAddress !== contract.creatorWallet,
      "Creator cannot claim their own contract"
    );
    assertAllowed(contract.isPublic, "Only public contracts can be claimed");
    assertState(contract.status === "open", "Only open contracts can be claimed");

    await tx.user.upsert({
      where: { walletAddress: input.walletAddress },
      update: {},
      create: { walletAddress: input.walletAddress }
    });

    await tx.contract.update({
      where: { id: contract.id },
      data: {
        requestedWorkerWallet: input.walletAddress,
        status: "claimed"
      }
    });

    await recordEvent(tx, {
      contractId: contract.id,
      actorWallet: input.walletAddress,
      eventType: "contract_claim_requested",
      payload: {
        requestedWorkerWallet: input.walletAddress
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
