import { createHash } from "node:crypto";
import { Buffer } from "node:buffer";
import { PublicKey } from "@solana/web3.js";
import { describe, expect, it } from "vitest";
import { decodeEscrowStateAccount } from "./solana-escrow-reconciliation";

function encodeAnchorString(value: string) {
  const bytes = Buffer.from(value, "utf8");
  const length = Buffer.alloc(4);
  length.writeUInt32LE(bytes.length, 0);

  return Buffer.concat([length, bytes]);
}

function encodeU64(value: bigint) {
  const bytes = Buffer.alloc(8);
  bytes.writeBigUInt64LE(value, 0);

  return bytes;
}

function accountDiscriminator(name: string) {
  return createHash("sha256").update(`account:${name}`).digest().subarray(0, 8);
}

describe("solana escrow reconciliation", () => {
  it("decodes escrow state accounts", () => {
    const creator = new PublicKey(new Uint8Array(32).fill(1));
    const worker = new PublicKey(new Uint8Array(32).fill(2));
    const usdcMint = new PublicKey(new Uint8Array(32).fill(3));
    const vault = new PublicKey(new Uint8Array(32).fill(4));
    const data = Buffer.concat([
      accountDiscriminator("EscrowState"),
      encodeAnchorString("contract_123"),
      creator.toBuffer(),
      worker.toBuffer(),
      usdcMint.toBuffer(),
      vault.toBuffer(),
      encodeU64(BigInt(1_000_000_000)),
      encodeU64(BigInt(1_000_000_000)),
      encodeU64(BigInt(250_000_000)),
      Buffer.from([1, 99, 33])
    ]);

    expect(decodeEscrowStateAccount(data)).toEqual({
      contractId: "contract_123",
      creator: creator.toBase58(),
      worker: worker.toBase58(),
      usdcMint: usdcMint.toBase58(),
      vault: vault.toBase58(),
      totalAmount: BigInt(1_000_000_000),
      fundedAmount: BigInt(1_000_000_000),
      releasedAmount: BigInt(250_000_000),
      status: 1,
      bump: 99,
      vaultBump: 33
    });
  });

  it("rejects accounts with the wrong discriminator", () => {
    const data = Buffer.alloc(32);

    expect(() => decodeEscrowStateAccount(data)).toThrow(
      "Escrow account discriminator does not match EscrowState"
    );
  });
});
