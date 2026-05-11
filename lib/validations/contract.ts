import { z } from "zod";
import { amountSchema, optionalDateSchema, walletAddressSchema } from "./shared";

const tagSchema = z.string().trim().min(1, "Tag is required").max(24, "Tag is too long");

export const milestoneInputSchema = z.object({
  title: z.string().trim().min(1, "Milestone title is required"),
  description: z.string().trim().optional(),
  amount: amountSchema,
  dueAt: optionalDateSchema
});

export const createContractSchema = z.object({
  creatorWallet: walletAddressSchema,
  workerWallet: walletAddressSchema.optional(),
  title: z.string().trim().min(1, "Contract title is required"),
  description: z.string().trim().optional(),
  tags: z.array(tagSchema).max(8, "Use up to 8 tags").optional(),
  isPublic: z.boolean().optional(),
  totalAmount: amountSchema,
  milestones: z.array(milestoneInputSchema).min(1, "At least one milestone is required")
});

export const listContractsSchema = z.object({
  walletAddress: walletAddressSchema.optional(),
  query: z.string().trim().max(80).optional()
});

export const getContractSchema = z.object({
  contractId: z.string().trim().min(1),
  walletAddress: walletAddressSchema.optional()
});

export const fundContractSchema = z.object({
  contractId: z.string().trim().min(1),
  walletAddress: walletAddressSchema
});

export const cancelContractSchema = z.object({
  contractId: z.string().trim().min(1),
  walletAddress: walletAddressSchema,
  reason: z.string().trim().max(500).optional()
});

export const updateContractVisibilitySchema = z.object({
  contractId: z.string().trim().min(1),
  walletAddress: walletAddressSchema,
  isPublic: z.boolean()
});

export const claimContractSchema = z.object({
  contractId: z.string().trim().min(1),
  walletAddress: walletAddressSchema
});

export const acceptContractClaimSchema = z.object({
  contractId: z.string().trim().min(1),
  walletAddress: walletAddressSchema
});

export const createContractCommentSchema = z.object({
  contractId: z.string().trim().min(1),
  walletAddress: walletAddressSchema,
  body: z.string().trim().min(1, "Comment is required").max(1000, "Comment is too long")
});

export type CreateContractInput = z.infer<typeof createContractSchema>;
export type ListContractsInput = z.infer<typeof listContractsSchema>;
export type GetContractInput = z.infer<typeof getContractSchema>;
export type FundContractInput = z.infer<typeof fundContractSchema>;
export type CancelContractInput = z.infer<typeof cancelContractSchema>;
export type UpdateContractVisibilityInput = z.infer<typeof updateContractVisibilitySchema>;
export type ClaimContractInput = z.infer<typeof claimContractSchema>;
export type AcceptContractClaimInput = z.infer<typeof acceptContractClaimSchema>;
export type CreateContractCommentInput = z.infer<typeof createContractCommentSchema>;
