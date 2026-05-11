import type { ContractStatus, Prisma } from "@prisma/client";

import { db } from "@/lib/db";
import { serializeContract } from "@/lib/services/serialize";
import { getPublicUserProfilesByWallets } from "@/lib/services/user-profiles";
import type { ListContractsInput } from "@/lib/validations/contract";

export async function listContractsForWallet(input: ListContractsInput) {
  const walletAddress = input.walletAddress?.trim();
  const query = input.query?.trim();
  const status = input.status;
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
            { requestedWorkerWallet: walletAddress },
            {
              applications: {
                some: {
                  applicantWallet: walletAddress
                }
              }
            }
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
  const filteredWhere: Prisma.ContractWhereInput = status
    ? {
        AND: [where, { status }]
      }
    : where;
  const contracts = await db.contract.findMany({
    where: filteredWhere,
    include: {
      milestones: {
        orderBy: { index: "asc" }
      },
      applications: {
        orderBy: { createdAt: "asc" }
      }
    },
    orderBy: { updatedAt: "desc" }
  });

  const wallets = contracts.flatMap((contract) => [
    contract.creatorWallet,
    contract.workerWallet,
    contract.requestedWorkerWallet,
    ...contract.applications.map((application) => application.applicantWallet)
  ]);
  const profilesByWallet = await getPublicUserProfilesByWallets(
    wallets.filter((wallet): wallet is string => Boolean(wallet?.trim()))
  );

  return contracts.map((contract) => serializeContract(contract, profilesByWallet));
}
