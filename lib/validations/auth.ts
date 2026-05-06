import { PublicKey } from "@solana/web3.js";
import { z } from "zod";

export const solanaWalletAddressSchema = z
  .string()
  .trim()
  .refine((value) => {
    try {
      new PublicKey(value);
      return true;
    } catch {
      return false;
    }
  }, "Wallet address must be a valid Solana public key");

export const createAuthChallengeSchema = z.object({
  walletAddress: solanaWalletAddressSchema
});

export const verifyAuthChallengeSchema = z.object({
  walletAddress: solanaWalletAddressSchema,
  nonce: z.string().trim().min(16),
  signature: z.string().trim().min(16)
});

export type CreateAuthChallengeInput = z.infer<typeof createAuthChallengeSchema>;
export type VerifyAuthChallengeInput = z.infer<typeof verifyAuthChallengeSchema>;
