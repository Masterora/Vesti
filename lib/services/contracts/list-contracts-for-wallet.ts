import type { ContractStatus, Prisma } from "@prisma/client";

import { db } from "@/lib/db";
import { serializeContract } from "@/lib/services/serialize";
import type { ListContractsInput } from "@/lib/validations/contract";

export async function listContractsForWallet(input: ListContractsInput) {
  const walletAddress = input.walletAddress?.trim();
  const publicStatuses: ContractStatus[] = ["open", "claimed"];
  const where: Prisma.ContractWhereInput = {
    OR: [
      {
        isPublic: true,
        status: {
          in: publicStatuses
        }
      },
      ...(walletAddress
        ? [
            { creatorWallet: walletAddress },
            { workerWallet: walletAddress },
            { requestedWorkerWallet: walletAddress }
          ]
        : [])
    ]
  };
  const contracts = await db.contract.findMany({
    where,
    include: {
      milestones: {
        orderBy: { index: "asc" }
      }
    },
    orderBy: { updatedAt: "desc" }
  });

  return contracts.map(serializeContract);
}
