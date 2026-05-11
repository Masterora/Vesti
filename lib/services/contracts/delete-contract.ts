import { db } from "@/lib/db";
import { assertAllowed, assertFound, assertState } from "@/lib/services/errors";
import type { DeleteContractInput } from "@/lib/validations/contract";

export async function deleteContract(input: DeleteContractInput) {
  return db.$transaction(async (tx) => {
    const contract = assertFound(
      await tx.contract.findUnique({
        where: { id: input.contractId }
      }),
      "Contract not found"
    );

    assertAllowed(
      input.walletAddress === contract.creatorWallet,
      "Only the Creator can delete this contract"
    );
    assertState(!contract.workerWallet, "Only projects without an assigned Worker can be deleted");
    assertState(
      ["open", "claimed"].includes(contract.status),
      "Only open or claimed projects can be deleted"
    );

    await tx.contract.delete({
      where: { id: contract.id }
    });

    return {
      contractId: contract.id,
      deleted: true
    };
  });
}
