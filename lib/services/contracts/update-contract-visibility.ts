import { lockContract } from "./contract-lock";
import { db } from "@/lib/db";
import { assertAllowed, assertFound } from "@/lib/services/errors";
import { serializeContractWithProfiles } from "@/lib/services/serialize";
import type { UpdateContractVisibilityInput } from "@/lib/validations/contract";

export async function updateContractVisibility(input: UpdateContractVisibilityInput) {
  return db.$transaction(async (tx) => {
    await lockContract(tx, input.contractId, true);
    const contract = assertFound(
      await tx.contract.findUnique({
        where: { id: input.contractId }
      }),
      "Contract not found"
    );

    assertAllowed(
      input.walletAddress === contract.creatorWallet,
      "Only the Creator can change contract visibility"
    );

    const updated = await tx.contract.update({
      where: { id: contract.id },
      data: {
        isPublic: input.isPublic,
        businessRevision: { increment: 1 }
      },
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

    return serializeContractWithProfiles(updated);
  });
}
