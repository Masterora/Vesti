import { db } from "@/lib/db";
import {
  createAuthMessage,
  verifySolanaMessageSignature
} from "@/lib/auth/wallet-session";
import { ServiceError } from "@/lib/services/errors";
import type { VerifyAuthChallengeInput } from "@/lib/validations/auth";

export async function verifyWalletAuthChallenge(input: VerifyAuthChallengeInput) {
  const walletAddress = input.walletAddress.trim();

  const challenge = await db.walletAuthChallenge.findUnique({
    where: { nonce: input.nonce }
  });

  if (
    !challenge ||
    challenge.walletAddress !== walletAddress ||
    challenge.consumedAt ||
    challenge.expiresAt <= new Date()
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

  await db.$transaction([
    db.walletAuthChallenge.update({
      where: { id: challenge.id },
      data: { consumedAt: new Date() }
    }),
    db.user.upsert({
      where: { walletAddress },
      update: {},
      create: { walletAddress }
    })
  ]);

  return {
    walletAddress
  };
}
