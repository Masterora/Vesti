import { PublicKey } from "@solana/web3.js";
import { describe, expect, it } from "vitest";
import { decimalToTokenUnits, deriveMilestoneReleaseReceiptPda, deriveEscrowPda, deriveVaultPda, deriveLegacyEscrowPda } from "./solana-escrow-accounts";

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

describe("deriveMilestoneReleaseReceiptPda", () => {
  it("isolates public contract names by creator while retaining explicit legacy derivation", () => {
    const program = new PublicKey("ErFsmiKY7WxjD9ArYmpqjCCUKnTcfzLm6tFpmWdFU9ck");
    const creator = new PublicKey("11111111111111111111111111111112");
    const outsider = new PublicKey("11111111111111111111111111111113");
    expect(deriveEscrowPda("public-id", program, creator).address.equals(deriveEscrowPda("public-id", program, outsider).address)).toBe(false);
    expect(deriveVaultPda("public-id", program, creator).address.equals(deriveVaultPda("public-id", program, outsider).address)).toBe(false);
    expect(deriveLegacyEscrowPda("public-id", program).address.equals(deriveEscrowPda("public-id", program, creator).address)).toBe(false);
  });
  it("uses one stable address per escrow and milestone", () => {
    const program = new PublicKey("ErFsmiKY7WxjD9ArYmpqjCCUKnTcfzLm6tFpmWdFU9ck");
    const escrow = new PublicKey("11111111111111111111111111111112");
    const otherEscrow = new PublicKey("11111111111111111111111111111113");
    const receipt = deriveMilestoneReleaseReceiptPda(escrow, "milestone-1", program).address.toBase58();

    expect(deriveMilestoneReleaseReceiptPda(escrow, "milestone-1", program).address.toBase58()).toBe(receipt);
    expect(deriveMilestoneReleaseReceiptPda(escrow, "milestone-2", program).address.toBase58()).not.toBe(receipt);
    expect(deriveMilestoneReleaseReceiptPda(otherEscrow, "milestone-1", program).address.toBase58()).not.toBe(receipt);
  });
});
