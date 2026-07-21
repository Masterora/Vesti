import { z } from "zod";
import { walletAddressSchema } from "@/lib/validations/shared";

export const prepareFundTransactionSchema = z.object({
  contractId: z.string().trim().min(1),
  walletAddress: walletAddressSchema,
  idempotencyKey: z.string().uuid()
});

export const prepareReleaseTransactionSchema = z.object({
  contractId: z.string().trim().min(1),
  milestoneId: z.string().trim().min(1),
  walletAddress: walletAddressSchema,
  idempotencyKey: z.string().uuid()
});

export const confirmFundTransactionSchema = z.object({
  contractId: z.string().trim().min(1),
  walletAddress: walletAddressSchema,
  transactionId: z.string().trim().min(1),
  txSig: z.string().trim().min(16)
});

export const confirmReleaseTransactionSchema = z.object({
  contractId: z.string().trim().min(1),
  milestoneId: z.string().trim().min(1),
  walletAddress: walletAddressSchema,
  transactionId: z.string().trim().min(1),
  txSig: z.string().trim().min(16)
});

export const submitEscrowTransactionSchema = z.object({
  contractId: z.string().trim().min(1),
  milestoneId: z.string().trim().min(1).optional(),
  walletAddress: walletAddressSchema,
  transactionId: z.string().trim().min(1),
  txSig: z.string().trim().min(16)
});

export type PrepareFundTransactionInput = z.infer<typeof prepareFundTransactionSchema>;
export type PrepareReleaseTransactionInput = z.infer<typeof prepareReleaseTransactionSchema>;
export type ConfirmFundTransactionInput = z.infer<typeof confirmFundTransactionSchema>;
export type ConfirmReleaseTransactionInput = z.infer<typeof confirmReleaseTransactionSchema>;
export type SubmitEscrowTransactionInput = z.infer<typeof submitEscrowTransactionSchema>;
