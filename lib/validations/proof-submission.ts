import { z } from "zod";
import { walletAddressSchema } from "./shared";

export const submitProofSchema = z.object({
  contractId: z.string().trim().min(1),
  milestoneId: z.string().trim().min(1),
  walletAddress: walletAddressSchema,
  note: z.string().trim().min(1, "Proof note is required"),
  proofUrl: z.string().trim().url().optional().or(z.literal("")),
  proofHash: z.string().trim().optional()
});

export const approveMilestoneSchema = z.object({
  contractId: z.string().trim().min(1),
  milestoneId: z.string().trim().min(1),
  walletAddress: walletAddressSchema
});

export const requestRevisionSchema = z.object({
  contractId: z.string().trim().min(1),
  milestoneId: z.string().trim().min(1),
  walletAddress: walletAddressSchema,
  note: z.string().trim().min(1, "Revision note is required")
});

export const releaseMilestoneSchema = z.object({
  contractId: z.string().trim().min(1),
  milestoneId: z.string().trim().min(1),
  walletAddress: walletAddressSchema,
  idempotencyKey: z.string().uuid().optional()
});

export const disputeMilestoneSchema = z.object({
  contractId: z.string().trim().min(1),
  milestoneId: z.string().trim().min(1),
  walletAddress: walletAddressSchema,
  reason: z.string().trim().min(1, "Dispute reason is required").max(500)
});

export const proposeDisputeResolutionSchema = z.object({
  contractId: z.string().trim().min(1),
  milestoneId: z.string().trim().min(1),
  walletAddress: walletAddressSchema,
  outcome: z.enum(["release_to_worker", "refund_to_creator"])
});

export const acceptDisputeResolutionSchema = z.object({
  contractId: z.string().trim().min(1),
  milestoneId: z.string().trim().min(1),
  walletAddress: walletAddressSchema,
  idempotencyKey: z.string().uuid().optional()
});

export const arbitrateDisputeResolutionSchema = z.object({
  contractId: z.string().trim().min(1),
  milestoneId: z.string().trim().min(1),
  walletAddress: walletAddressSchema,
  outcome: z.enum(["release_to_worker", "refund_to_creator"]),
  idempotencyKey: z.string().uuid().optional()
});

export type SubmitProofInput = z.infer<typeof submitProofSchema>;
export type ApproveMilestoneInput = z.infer<typeof approveMilestoneSchema>;
export type RequestRevisionInput = z.infer<typeof requestRevisionSchema>;
export type ReleaseMilestoneInput = z.infer<typeof releaseMilestoneSchema>;
export type DisputeMilestoneInput = z.infer<typeof disputeMilestoneSchema>;
export type ProposeDisputeResolutionInput = z.infer<typeof proposeDisputeResolutionSchema>;
export type AcceptDisputeResolutionInput = z.infer<typeof acceptDisputeResolutionSchema>;
export type ArbitrateDisputeResolutionInput = z.infer<typeof arbitrateDisputeResolutionSchema>;
