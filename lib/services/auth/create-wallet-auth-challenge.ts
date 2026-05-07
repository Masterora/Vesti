import { db } from "@/lib/db";
import {
  createAuthMessage,
  createAuthNonce,
  getChallengeExpiresAt
} from "@/lib/auth/wallet-session";
import type { CreateAuthChallengeInput } from "@/lib/validations/auth";

export async function createWalletAuthChallenge(input: CreateAuthChallengeInput) {
  const walletAddress = input.walletAddress.trim();
  const nonce = createAuthNonce();
  const message = createAuthMessage({ walletAddress, nonce });
  const expiresAt = getChallengeExpiresAt();

  await db.walletAuthChallenge.create({
    data: {
      walletAddress,
      nonce,
      message,
      expiresAt
    }
  });

  return {
    walletAddress,
    nonce,
    message,
    expiresAt: expiresAt.toISOString()
  };
}
