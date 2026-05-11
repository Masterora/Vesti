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

const optionalAvatarImage = z
  .string()
  .trim()
  .max(200_000, "Avatar image is too large")
  .refine(
    (value) => !value || /^data:image\/[a-zA-Z0-9.+-]+;base64,[a-zA-Z0-9+/=\s]+$/.test(value),
    "Avatar image must be a valid image data URL"
  )
  .optional()
  .transform((value) => (value ? value : undefined));

export const updateProfileSchema = z.object({
  displayName: optionalString(40, "Display name is too long"),
  email: optionalEmail,
  bio: optionalString(280, "Bio is too long"),
  avatarImage: optionalAvatarImage
});

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
