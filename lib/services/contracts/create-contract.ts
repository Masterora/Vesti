import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { recordEvent } from "@/lib/services/events/record-event";
import { ServiceError } from "@/lib/services/errors";
import { serializeContractWithProfiles } from "@/lib/services/serialize";
import type { CreateContractInput } from "@/lib/validations/contract";

function decimal(value: string) {
  return new Prisma.Decimal(value);
}

export async function createContract(input: CreateContractInput) {
  const creatorWallet = input.creatorWallet.trim();
  const workerWallet = input.workerWallet?.trim() || null;
  const hasAssignedWorker = Boolean(workerWallet);
  const tags = Array.from(
    new Set(
      (input.tags ?? [])
        .map((tag) => tag.trim().toLowerCase())
        .filter(Boolean)
    )
  );

  if (workerWallet && creatorWallet === workerWallet) {
    throw new ServiceError("Creator and Worker wallets must be different");
  }

  const totalAmount = decimal(input.totalAmount);
  const milestoneTotal = input.milestones.reduce(
    (sum, milestone) => sum.plus(decimal(milestone.amount)),
    new Prisma.Decimal(0)
  );

  if (!milestoneTotal.equals(totalAmount)) {
    throw new ServiceError("Milestone amounts must add up to the contract total");
  }

  return db.$transaction(async (tx) => {
    await tx.user.upsert({
      where: { walletAddress: creatorWallet },
      update: {},
      create: { walletAddress: creatorWallet }
    });

    if (workerWallet) {
      await tx.user.upsert({
        where: { walletAddress: workerWallet },
        update: {},
        create: { walletAddress: workerWallet }
      });
    }

    const contract = await tx.contract.create({
      data: {
        creatorWallet,
        workerWallet,
        title: input.title,
        description: input.description || null,
        tags,
        isPublic: input.isPublic ?? !hasAssignedWorker,
        totalAmount,
        status: hasAssignedWorker ? "draft" : "open",
        milestones: {
          create: input.milestones.map((milestone, index) => ({
            index: index + 1,
            title: milestone.title,
            description: milestone.description || null,
            amount: decimal(milestone.amount),
            dueAt: milestone.dueAt ? new Date(milestone.dueAt) : null
          }))
        }
      },
      include: {
        milestones: {
          orderBy: { index: "asc" }
        }
      }
    });

    await recordEvent(tx, {
      contractId: contract.id,
      actorWallet: creatorWallet,
      eventType: "contract_created",
      payload: {
        title: contract.title,
        totalAmount: contract.totalAmount.toString(),
        milestoneCount: contract.milestones.length,
        tags: contract.tags,
        isPublic: contract.isPublic,
        status: contract.status
      }
    });

    const created = await tx.contract.findUniqueOrThrow({
      where: { id: contract.id },
      include: {
        milestones: {
          orderBy: { index: "asc" }
        },
        events: {
          orderBy: { createdAt: "desc" }
        }
      }
    });

    return serializeContractWithProfiles(created);
  });
}
