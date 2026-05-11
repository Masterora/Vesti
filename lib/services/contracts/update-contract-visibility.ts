import { db } from "@/lib/db";
import { assertAllowed, assertFound } from "@/lib/services/errors";
import { serializeContract } from "@/lib/services/serialize";
import type { UpdateContractVisibilityInput } from "@/lib/validations/contract";

export async function updateContractVisibility(input: UpdateContractVisibilityInput) {
  const contract = assertFound(
    await db.contract.findUnique({
      where: { id: input.contractId }
    }),
    "Contract not found"
  );

  assertAllowed(
    input.walletAddress === contract.creatorWallet,
    "Only the Creator can change contract visibility"
  );

  const updated = await db.contract.update({
    where: { id: contract.id },
    data: {
      isPublic: input.isPublic
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

  return serializeContract(updated);
}
