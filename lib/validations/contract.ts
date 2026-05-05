import { z } from "zod";
import { amountSchema, optionalDateSchema, walletAddressSchema } from "./shared";

export const milestoneInputSchema = z.object({
  title: z.string().trim().min(1, "Milestone title is required"),
  description: z.string().trim().optional(),
  amount: amountSchema,
  dueAt: optionalDateSchema
});

export const createContractSchema = z.object({
  creatorWallet: walletAddressSchema,
  workerWallet: walletAddressSchema,
  title: z.string().trim().min(1, "Contract title is required"),
  description: z.string().trim().optional(),
  totalAmount: amountSchema,
  milestones: z.array(milestoneInputSchema).min(1, "At least one milestone is required")
});

export const listContractsSchema = z.object({
  walletAddress: walletAddressSchema
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

export type CreateContractInput = z.infer<typeof createContractSchema>;
export type ListContractsInput = z.infer<typeof listContractsSchema>;
export type GetContractInput = z.infer<typeof getContractSchema>;
export type FundContractInput = z.infer<typeof fundContractSchema>;
export type CancelContractInput = z.infer<typeof cancelContractSchema>;
