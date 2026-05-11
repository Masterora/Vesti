import { db } from "@/lib/db";
import { getContractRole } from "@/lib/auth/wallet-role";
import { getPendingApplicantWallets } from "@/lib/domain/contract-applications";
import { assertAllowed, assertFound } from "@/lib/services/errors";
import { serializeContractComment } from "@/lib/services/serialize";
import { serializePublicUserProfile } from "@/lib/services/user-profiles";
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

    const comment = await tx.contractComment.create({
      data: {
        contractId: contract.id,
        authorWallet: input.walletAddress,
        body: input.body.trim()
      }
    });

    const author = await tx.user.findUniqueOrThrow({
      where: { walletAddress: input.walletAddress },
      select: {
        walletAddress: true,
        displayName: true,
        avatarUpdatedAt: true
      }
    });

    return {
      comment: serializeContractComment(comment),
      authorProfile: serializePublicUserProfile(author)
    };
  });
}
