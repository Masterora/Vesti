import { db } from "@/lib/db";
import { serializeContract } from "@/lib/services/serialize";
import type { ListContractsInput } from "@/lib/validations/contract";

export async function listContractsForWallet(input: ListContractsInput) {
  const contracts = await db.contract.findMany({
    where: {
      OR: [{ creatorWallet: input.walletAddress }, { workerWallet: input.walletAddress }]
    },
    include: {
      milestones: {
        orderBy: { index: "asc" }
      }
    },
    orderBy: { updatedAt: "desc" }
  });

  return contracts.map(serializeContract);
}
