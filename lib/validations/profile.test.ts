import { describe, expect, it } from "vitest";
import { updateProfileSchema } from "./profile";

describe("profile validation", () => {
  it("accepts empty profile fields", () => {
    expect(
      updateProfileSchema.parse({
        displayName: "",
        email: "",
        bio: "   "
      })
    ).toEqual({
      displayName: undefined,
      email: undefined,
      bio: undefined
    });
  });

  it("accepts trimmed profile values", () => {
    expect(
      updateProfileSchema.parse({
        displayName: "  Ran  ",
        email: " Ran@example.com ",
        bio: " Building Vesti "
      })
    ).toEqual({
      displayName: "Ran",
      email: "Ran@example.com",
      bio: "Building Vesti"
    });
  });

  it("rejects invalid emails", () => {
    expect(() =>
      updateProfileSchema.parse({
        email: "not-an-email"
      })
    ).toThrow("Email must be valid");
  });
});
