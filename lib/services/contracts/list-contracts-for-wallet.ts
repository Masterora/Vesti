import type { ContractStatus, Prisma } from "@prisma/client";

import { db } from "@/lib/db";
import { serializeContractListItem } from "@/lib/services/serialize";
import { getPublicUserProfilesByWallets } from "@/lib/services/profile/user-profiles";
import { normalizeContractDisplayIdQuery } from "@/lib/utils";
import type { ListContractsInput } from "@/lib/validations/contract";

export function buildListContractsWhere(input: ListContractsInput, extraWhere?: Prisma.ContractWhereInput) {
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
            { arbitratorWallet: walletAddress },
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
  return extraWhere ? { AND: [filteredWhere, extraWhere] } : filteredWhere;
}

export async function listContractsForWallet(
  input: ListContractsInput,
  options?: { where?: Prisma.ContractWhereInput; skip?: number; take?: number; orderBy?: Prisma.ContractOrderByWithRelationInput[] }
) {
  const walletAddress = input.walletAddress?.trim();
  const contracts = await db.contract.findMany({
    where: buildListContractsWhere(input, options?.where),
    select: {
      id: true,
      displayId: true,
      creatorWallet: true,
      workerWallet: true,
      disputePolicy: true,
      arbitratorWallet: true,
      requestedWorkerWallet: true,
      title: true,
      description: true,
      tags: true,
      isPublic: true,
      totalAmount: true,
      fundedAmount: true,
      releasedAmount: true,
      refundedAmount: true,
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
      milestones: {
        orderBy: { index: "asc" },
        select: {
          id: true,
          index: true,
          title: true,
          amount: true,
          dueAt: true,
          status: true
        }
      },
      disputes: {
        where: { status: { in: ["open", "proposed"] } },
        select: { status: true, proposedBy: true },
        take: 1
      },
      _count: {
        select: {
          milestones: true
        }
      }
    },
    orderBy: options?.orderBy ?? [{ updatedAt: "desc" }, { id: "desc" }],
    skip: options?.skip,
    take: options?.take
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

  return contracts.map((contract) => {
    const serialized = serializeContractListItem(contract, profilesByWallet);
    const isCreator = walletAddress === contract.creatorWallet;
    const isApplicant = Boolean(
      walletAddress && contract.applications.some((application) => application.applicantWallet === walletAddress)
    );
    const visibleWallets = new Set(
      [contract.creatorWallet, contract.workerWallet, isApplicant ? walletAddress : null].filter(
        (wallet): wallet is string => Boolean(wallet)
      )
    );

    return {
      ...serialized,
      requestedWorkerWallet: isCreator ? serialized.requestedWorkerWallet : null,
      pendingApplicantWallets: isCreator
        ? serialized.pendingApplicantWallets
        : isApplicant && walletAddress
          ? [walletAddress]
          : [],
      profiles: serialized.profiles?.filter((profile) => visibleWallets.has(profile.walletAddress))
    };
  });
}
