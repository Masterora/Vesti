import { z } from "zod";

export const walletAddressSchema = z.string().trim().min(4, "Wallet address is required");

export const amountSchema = z
  .string()
  .trim()
  .regex(/^\d+(\.\d{1,6})?$/, "Amount must be a decimal string with up to 6 decimals")
  .refine((value) => Number(value) > 0, "Amount must be greater than zero");

export const optionalDateSchema = z
  .string()
  .trim()
  .optional()
  .transform((value) => (value ? value : undefined));
