import { db } from "@/lib/db";
import {
  createAuthMessage,
  verifySolanaMessageSignature
} from "@/lib/auth/wallet-session";
import { ServiceError } from "@/lib/services/errors";
import { serializeSessionUserProfile } from "@/lib/services/profile/user-profiles";
import type { VerifyAuthChallengeInput } from "@/lib/validations/auth";

export async function verifyWalletAuthChallenge(input: VerifyAuthChallengeInput) {
  const walletAddress = input.walletAddress.trim();
  const now = new Date();

  const challenge = await db.walletAuthChallenge.findUnique({
    where: { nonce: input.nonce }
  });

  if (
    !challenge ||
    challenge.walletAddress !== walletAddress ||
    challenge.consumedAt ||
    challenge.expiresAt <= now
  ) {
    throw new ServiceError("Wallet auth challenge is invalid or expired", 401);
  }

  const message = createAuthMessage({
    walletAddress,
    nonce: challenge.nonce
  });
  const isValidSignature = verifySolanaMessageSignature({
    walletAddress,
    message,
    signature: input.signature
  });

  if (!isValidSignature) {
    throw new ServiceError("Wallet signature is invalid", 401);
  }

  const user = await db.$transaction(async (tx) => {
    const consumed = await tx.walletAuthChallenge.updateMany({
      where: {
        id: challenge.id,
        consumedAt: null,
        expiresAt: { gt: now }
      },
      data: { consumedAt: now }
    });

    if (consumed.count !== 1) {
      throw new ServiceError("Wallet auth challenge is invalid or expired", 401);
    }

    return tx.user.upsert({
      where: { walletAddress },
      update: {},
      create: { walletAddress },
      select: {
        walletAddress: true,
        displayName: true,
        email: true,
        bio: true,
        avatarImage: true,
        createdAt: true,
        _count: {
          select: {
            createdContracts: {
              where: {
                status: "completed"
              }
            },
            workedContracts: {
              where: {
                status: "completed"
              }
            }
          }
        }
      }
    });
  });

  return {
    walletAddress,
    profile: serializeSessionUserProfile(user)
  };
}
