import { db } from "@/lib/db";
import { getContractRole } from "@/lib/auth/wallet-role";
import { getPendingApplicantWallets } from "@/lib/domain/contract-applications";
import { assertAllowed, assertFound } from "@/lib/services/errors";
import { serializeContract } from "@/lib/services/serialize";
import type { CreateContractCommentInput } from "@/lib/validations/contract";

export async function createContractComment(input: CreateContractCommentInput) {
  return db.$transaction(async (tx) => {
    const contract = assertFound(
      await tx.contract.findUnique({
        where: { id: input.contractId },
        include: {
          applications: {
            orderBy: { createdAt: "asc" }
          }
        }
      }),
      "Contract not found"
    );

    const role = getContractRole({
      walletAddress: input.walletAddress,
      creatorWallet: contract.creatorWallet,
      workerWallet: contract.workerWallet,
      applicantWallets: getPendingApplicantWallets(contract),
      requestedWorkerWallet: contract.requestedWorkerWallet
    });

    assertAllowed(
      contract.isPublic || role !== "viewer",
      "Only public viewers or contract participants can comment on this contract"
    );

    await tx.user.upsert({
      where: { walletAddress: input.walletAddress },
      update: {},
      create: { walletAddress: input.walletAddress }
    });

    await tx.contractComment.create({
      data: {
        contractId: contract.id,
        authorWallet: input.walletAddress,
        body: input.body.trim()
      }
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
        },
        comments: {
          orderBy: { createdAt: "asc" }
        },
        applications: {
          orderBy: { createdAt: "asc" }
        }
      }
    });

    return serializeContract(updated);
  });
}
