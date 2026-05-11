import { db } from "@/lib/db";
import { assertAllowed, assertFound, assertState } from "@/lib/services/errors";
import { serializeContractWithProfiles } from "@/lib/services/serialize";
import type { RenameContractInput } from "@/lib/validations/contract";

export async function renameContract(input: RenameContractInput) {
  return db.$transaction(async (tx) => {
    const contract = assertFound(
      await tx.contract.findUnique({
        where: { id: input.contractId }
      }),
      "Contract not found"
    );

    assertAllowed(
      input.walletAddress === contract.creatorWallet,
      "Only the Creator can rename this contract"
    );
    assertState(
      ["open", "claimed", "draft", "active", "disputed"].includes(contract.status),
      "Only open, claimed, draft, active, or disputed contracts can be renamed"
    );

    await tx.contract.update({
      where: { id: contract.id },
      data: {
        title: input.title.trim()
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
        comments: {
          orderBy: { createdAt: "asc" }
        },
        applications: {
          orderBy: { createdAt: "asc" }
        }
      }
    });

    return serializeContractWithProfiles(updated);
  });
}
