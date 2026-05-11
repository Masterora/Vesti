import { describe, expect, it } from "vitest";
import { updateProfileSchema } from "./profile";

describe("profile validation", () => {
  it("accepts empty profile fields", () => {
    expect(
      updateProfileSchema.parse({
        displayName: "",
        email: "",
        bio: "   ",
        avatarImage: ""
      })
    ).toEqual({
      displayName: undefined,
      email: undefined,
      bio: undefined,
      avatarImage: undefined
    });
  });

  it("accepts trimmed profile values", () => {
    expect(
      updateProfileSchema.parse({
        displayName: "  Ran  ",
        email: " Ran@example.com ",
        bio: " Building Vesti ",
        avatarImage: "data:image/png;base64,Zm9v"
      })
    ).toEqual({
      displayName: "Ran",
      email: "Ran@example.com",
      bio: "Building Vesti",
      avatarImage: "data:image/png;base64,Zm9v"
    });
  });

  it("rejects invalid emails", () => {
    expect(() =>
      updateProfileSchema.parse({
        email: "not-an-email"
      })
    ).toThrow("Email must be valid");
  });

  it("rejects invalid avatar payloads", () => {
    expect(() =>
      updateProfileSchema.parse({
        avatarImage: "https://example.com/avatar.png"
      })
    ).toThrow("Avatar image must be a valid image data URL");
  });
});
