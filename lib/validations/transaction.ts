import { z } from "zod";
import { walletAddressSchema } from "@/lib/validations/shared";

export const prepareFundTransactionSchema = z.object({
  contractId: z.string().trim().min(1),
  walletAddress: walletAddressSchema,
  idempotencyKey: z.string().uuid(),
});

export const prepareReleaseTransactionSchema = z.object({
  contractId: z.string().trim().min(1),
  milestoneId: z.string().trim().min(1),
  walletAddress: walletAddressSchema,
  idempotencyKey: z.string().uuid(),
});

export const confirmFundTransactionSchema = z.object({
  contractId: z.string().trim().min(1),
  walletAddress: walletAddressSchema,
  transactionId: z.string().trim().min(1),
  txSig: z.string().trim().min(16),
});

export const confirmReleaseTransactionSchema = z.object({
  contractId: z.string().trim().min(1),
  milestoneId: z.string().trim().min(1),
  walletAddress: walletAddressSchema,
  transactionId: z.string().trim().min(1),
  txSig: z.string().trim().min(16),
});

export const submitEscrowTransactionSchema = z.object({
  contractId: z.string().trim().min(1),
  milestoneId: z.string().trim().min(1).optional(),
  walletAddress: walletAddressSchema,
  transactionId: z.string().trim().min(1),
  txSig: z.string().trim().min(16),
});

export type PrepareFundTransactionInput = z.infer<
  typeof prepareFundTransactionSchema
>;
export type PrepareReleaseTransactionInput = z.infer<
  typeof prepareReleaseTransactionSchema
>;
export type ConfirmFundTransactionInput = z.infer<
  typeof confirmFundTransactionSchema
>;
export type ConfirmReleaseTransactionInput = z.infer<
  typeof confirmReleaseTransactionSchema
>;
export type SubmitEscrowTransactionInput = z.infer<
  typeof submitEscrowTransactionSchema
>;

export const prepareDisputeTransactionSchema = prepareReleaseTransactionSchema
  .extend({
    kind: z.enum([
      "dispute_open",
      "dispute_propose",
      "dispute_accept_release",
      "dispute_accept_refund",
      "dispute_arbitrate_release",
      "dispute_arbitrate_refund",
    ]),
    reason: z.string().trim().min(1).max(2000).optional(),
    outcome: z.enum(["release_to_worker", "refund_to_creator"]).optional(),
    expectedProposalVersion: z
      .string()
      .regex(/^(0|[1-9][0-9]*)$/)
      .max(20)
      .optional(),
  })
  .strict();
export const recordSignedTransactionSchema = z.object({
  transactionId: z.string().min(1),
  walletAddress: walletAddressSchema,
  signedTransaction: z
    .string()
    .min(1)
    .max(1800)
    .regex(/^[A-Za-z0-9+/]+={0,2}$/),
});
export const transactionStatusSchema = z.object({
  transactionId: z.string().min(1),
  walletAddress: walletAddressSchema,
});
export const chainSyncSchema = z.object({
  contractId: z.string().min(1),
  walletAddress: walletAddressSchema,
});
