import type { ContractStatus, Prisma } from "@prisma/client";

import { db } from "@/lib/db";
import { serializeContract } from "@/lib/services/serialize";
import type { ListContractsInput } from "@/lib/validations/contract";

export async function listContractsForWallet(input: ListContractsInput) {
  const walletAddress = input.walletAddress?.trim();
  const query = input.query?.trim();
  const publicStatuses: ContractStatus[] = ["open", "claimed"];
  const visibilityWhere: Prisma.ContractWhereInput = {
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
  const queryTerms = query
    ? Array.from(new Set(query.toLowerCase().split(/[,\s]+/).map((term) => term.trim()).filter(Boolean)))
    : [];
  const searchWhere: Prisma.ContractWhereInput | null = query
    ? {
        OR: [
          {
            title: {
              contains: query,
              mode: "insensitive"
            }
          },
          ...queryTerms.map((term) => ({
            tags: {
              has: term
            }
          }))
        ]
      }
    : null;
  const where: Prisma.ContractWhereInput = searchWhere
    ? {
        AND: [visibilityWhere, searchWhere]
      }
    : visibilityWhere;
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
