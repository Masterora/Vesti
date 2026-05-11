import { db } from "@/lib/db";
import { recordEvent } from "@/lib/services/events/record-event";
import { assertAllowed, assertFound, assertState } from "@/lib/services/errors";
import { serializeContract } from "@/lib/services/serialize";
import type { CancelContractInput } from "@/lib/validations/contract";

export async function cancelContract(input: CancelContractInput) {
  return db.$transaction(async (tx) => {
    const contract = assertFound(
      await tx.contract.findUnique({
        where: { id: input.contractId }
      }),
      "Contract not found"
    );

    assertAllowed(
      input.walletAddress === contract.creatorWallet,
      "Only the Creator can cancel this contract"
    );
    assertState(
      ["open", "claimed", "draft"].includes(contract.status),
      "Only open, claimed, or draft contracts can be cancelled"
    );

    await tx.contract.update({
      where: { id: contract.id },
      data: {
        status: "cancelled"
      }
    });

    await recordEvent(tx, {
      contractId: contract.id,
      actorWallet: input.walletAddress,
      eventType: "contract_cancelled",
      payload: {
        reason: input.reason || null
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
        },
        applications: {
          orderBy: { createdAt: "asc" }
        }
      }
    });

    return serializeContract(updated);
  });
}
