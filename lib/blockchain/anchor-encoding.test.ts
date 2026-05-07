import { describe, expect, it } from "vitest";
import {
  anchorInstructionDiscriminator,
  encodeAnchorInstruction,
  encodeAnchorString,
  encodeU64
} from "./anchor-encoding";

describe("Anchor instruction encoding", () => {
  it("uses Anchor global instruction discriminators", () => {
    expect(anchorInstructionDiscriminator("initialize_escrow").toString("hex")).toBe(
      "f3a04d990b5c30d1"
    );
    expect(anchorInstructionDiscriminator("mark_funded").toString("hex")).toBe(
      "9a19863dc8b81d38"
    );
    expect(anchorInstructionDiscriminator("release_milestone").toString("hex")).toBe(
      "3802c7a4b86ca7de"
    );
  });

  it("encodes strings with little-endian length prefixes", () => {
    expect(encodeAnchorString("vesti").toString("hex")).toBe("050000007665737469");
  });

  it("encodes u64 values as little-endian bytes", () => {
    expect(encodeU64(BigInt(1_000_000)).toString("hex")).toBe("40420f0000000000");
    expect(() => encodeU64(BigInt(-1))).toThrow("u64 value cannot be negative");
  });

  it("combines discriminator and fields", () => {
    expect(encodeAnchorInstruction("mark_funded", [encodeU64(BigInt(1))]).toString("hex")).toBe(
      "9a19863dc8b81d380100000000000000"
    );
  });
});
