import { z } from "zod";

const optionalString = (max: number, tooLongMessage: string) =>
  z
    .string()
    .trim()
    .max(max, tooLongMessage)
    .optional()
    .transform((value) => (value?.trim() ? value.trim() : undefined));

const optionalEmail = z
  .string()
  .trim()
  .max(120, "Email is too long")
  .email("Email must be valid")
  .optional()
  .or(z.literal("").transform(() => undefined));

export const updateProfileSchema = z.object({
  displayName: optionalString(40, "Display name is too long"),
  email: optionalEmail,
  bio: optionalString(280, "Bio is too long")
});

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
