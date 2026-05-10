import { db } from "@/lib/db";
import { getEscrowAdapter } from "@/lib/blockchain/escrow-adapter";
import { applyContractFunded } from "@/lib/services/contracts/apply-contract-funded";
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
    assertState(Boolean(contract.workerWallet), "Assigned Worker wallet is required before funding");

    const escrow = await adapter.fundContract({
      contractId: contract.id,
      creatorWallet: contract.creatorWallet,
      workerWallet: contract.workerWallet!,
      amount: contract.totalAmount
    });

    await applyContractFunded(tx, {
      contract,
      actorWallet: input.walletAddress,
      escrowAccount: escrow.escrowAccount,
      txSig: escrow.txSig
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
