import type { ContractStatus, Prisma } from "@prisma/client";

import { db } from "@/lib/db";
import { serializeContractListItem } from "@/lib/services/serialize";
import { getPublicUserProfilesByWallets } from "@/lib/services/user-profiles";
import { normalizeContractDisplayIdQuery } from "@/lib/utils";
import type { ListContractsInput } from "@/lib/validations/contract";

export async function listContractsForWallet(input: ListContractsInput) {
  const walletAddress = input.walletAddress?.trim();
  const query = input.query?.trim();
  const status = input.status;
  const displayIdQuery = query ? normalizeContractDisplayIdQuery(query) : null;
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
  const displayIdWhere = displayIdQuery
    ? {
        displayId:
          displayIdQuery.length === 16
            ? {
                equals: displayIdQuery
              }
            : {
                startsWith: displayIdQuery
              }
      }
    : null;
  const searchWhere: Prisma.ContractWhereInput | null = query
    ? {
        OR: [
          {
            title: {
              contains: query,
              mode: "insensitive"
            }
          },
          ...(displayIdWhere ? [displayIdWhere] : []),
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
    select: {
      id: true,
      displayId: true,
      creatorWallet: true,
      workerWallet: true,
      requestedWorkerWallet: true,
      title: true,
      description: true,
      tags: true,
      isPublic: true,
      totalAmount: true,
      fundedAmount: true,
      releasedAmount: true,
      status: true,
      escrowAccount: true,
      createdAt: true,
      updatedAt: true,
      applications: {
        orderBy: { createdAt: "asc" },
        select: {
          applicantWallet: true
        }
      },
      _count: {
        select: {
          milestones: true
        }
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

  return contracts.map((contract) => serializeContractListItem(contract, profilesByWallet));
}
