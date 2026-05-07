import { describe, expect, it } from "vitest";
import { decimalToTokenUnits } from "./solana-escrow-accounts";

describe("decimalToTokenUnits", () => {
  it("uses shared exact amount conversion", () => {
    expect(decimalToTokenUnits("12.345678")).toBe(BigInt(12345678));
  });

  it("rejects values with more precision than the mint supports", () => {
    expect(() => decimalToTokenUnits("0.0000001")).toThrow(
      "Amount cannot have more than 6 decimal places"
    );
  });
});
