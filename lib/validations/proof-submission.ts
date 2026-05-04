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

export const releaseMilestoneSchema = z.object({
  contractId: z.string().trim().min(1),
  milestoneId: z.string().trim().min(1),
  walletAddress: walletAddressSchema
});

export type SubmitProofInput = z.infer<typeof submitProofSchema>;
export type ApproveMilestoneInput = z.infer<typeof approveMilestoneSchema>;
export type ReleaseMilestoneInput = z.infer<typeof releaseMilestoneSchema>;
