import { createHash } from "node:crypto";
import { Buffer } from "node:buffer";

export function anchorInstructionDiscriminator(name: string) {
  return createHash("sha256").update(`global:${name}`).digest().subarray(0, 8);
}

export function encodeAnchorString(value: string) {
  const bytes = Buffer.from(value, "utf8");
  const length = Buffer.alloc(4);
  length.writeUInt32LE(bytes.length, 0);

  return Buffer.concat([length, bytes]);
}

export function encodeU64(value: bigint) {
  if (value < BigInt(0)) {
    throw new Error("u64 value cannot be negative");
  }

  const bytes = Buffer.alloc(8);
  bytes.writeBigUInt64LE(value);

  return bytes;
}

export function encodeAnchorInstruction(name: string, fields: Buffer[] = []) {
  return Buffer.concat([anchorInstructionDiscriminator(name), ...fields]);
}
