import { db } from "@/lib/db";
import { recordEvent } from "@/lib/services/events/record-event";
import { assertAllowed, assertFound, assertState } from "@/lib/services/errors";
import { serializeContract } from "@/lib/services/serialize";
import type { AcceptContractClaimInput } from "@/lib/validations/contract";

export async function acceptContractClaim(input: AcceptContractClaimInput) {
  return db.$transaction(async (tx) => {
    const contract = assertFound(
      await tx.contract.findUnique({
        where: { id: input.contractId }
      }),
      "Contract not found"
    );

    assertAllowed(
      input.walletAddress === contract.creatorWallet,
      "Only the Creator can accept a worker claim"
    );
    assertState(contract.status === "claimed", "Only claimed contracts can accept a worker");
    assertState(
      Boolean(contract.requestedWorkerWallet),
      "This contract does not have a pending worker claim"
    );

    await tx.contract.update({
      where: { id: contract.id },
      data: {
        workerWallet: contract.requestedWorkerWallet,
        requestedWorkerWallet: null,
        status: "draft"
      }
    });

    await recordEvent(tx, {
      contractId: contract.id,
      actorWallet: input.walletAddress,
      eventType: "contract_claim_accepted",
      payload: {
        workerWallet: contract.requestedWorkerWallet
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
