import { db } from "@/lib/db";
import { getContractRole } from "@/lib/auth/wallet-role";
import { assertAllowed, assertFound } from "@/lib/services/errors";
import { serializeContract } from "@/lib/services/serialize";
import type { GetContractInput } from "@/lib/validations/contract";

export async function getContractById(input: GetContractInput) {
  const contract = assertFound(
    await db.contract.findUnique({
      where: { id: input.contractId },
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
    }),
    "Contract not found"
  );

  const role = getContractRole({
    walletAddress: input.walletAddress,
    creatorWallet: contract.creatorWallet,
    workerWallet: contract.workerWallet
  });

  assertAllowed(role !== "viewer", "Only the Creator or Worker can view this contract");

  return serializeContract(contract);
}
