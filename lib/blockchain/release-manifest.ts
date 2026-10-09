import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { z } from "zod";
import { PublicKey } from "@solana/web3.js";
import { ServiceError } from "@/lib/services/errors";

const hash = z.string().regex(/^[a-f0-9]{64}$/);
const address = z.string().refine((value) => { try { new PublicKey(value); return true; } catch { return false; } });
const integer = z.string().regex(/^(0|[1-9][0-9]*)$/);
export const releaseManifestSchema = z.object({
  schemaVersion: z.literal(1), releaseId: z.string().regex(/^[a-zA-Z0-9._-]{1,80}$/),
  sourceCommit: z.string().regex(/^[a-f0-9]{40}$/), cluster: z.enum(["localnet", "devnet"]),
  genesisHash: address, programId: address, programDataAddress: address.nullable(),
  programLoader: address, upgradeAuthority: address.nullable(), deployedSlot: integer,
  deploymentTxSig: z.string().min(1), predecessorManifestSha256: hash.nullable(),
  protocolDescriptorSha256: hash, activationEvidenceSha256: hash,
  artifact: z.object({ sha256: hash, byteLength: z.number().int().positive(), idlSha256: hash }).strict(),
  deployedProgram: z.object({ sha256: hash, payloadLength: z.number().int().positive() }).strict(),
  mint: z.object({ address, tokenProgram: z.literal("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"), decimals: z.literal(6), label: z.literal("test_usdc") }).strict(),
  toolchain: z.object({ anchor: z.string(), solana: z.string(), rust: z.string(), node: z.string() }).strict(),
  verificationEvidence: z.array(z.string()).min(1),
}).strict();
export type ChainReleaseManifest = z.infer<typeof releaseManifestSchema>;
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value !== null && typeof value === "object") return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(",")}}`;
  return JSON.stringify(value);
}
export const releaseDigest = (value: unknown) => createHash("sha256").update(canonicalJson(value)).digest("hex");
export function readReleaseManifest(path: string) {
  return releaseManifestSchema.parse(JSON.parse(readFileSync(path, "utf8")));
}
export function configuredRelease() {
  try {
    const manifest = readReleaseManifest(process.env.ESCROW_RELEASE_MANIFEST_PATH || "");
    if (manifest.releaseId !== process.env.ESCROW_RELEASE_ID || manifest.cluster !== process.env.NEXT_PUBLIC_SOLANA_NETWORK ||
      manifest.genesisHash !== process.env.ESCROW_NETWORK_GENESIS_HASH || manifest.programId !== process.env.ESCROW_PROGRAM_ID ||
      manifest.mint.address !== process.env.NEXT_PUBLIC_USDC_MINT || manifest.deployedProgram.sha256 !== process.env.ESCROW_PROGRAM_SHA256)
      throw new Error("Manifest configuration differs");
    if (manifest.cluster === "devnet" && manifest.genesisHash !== "EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG") throw new Error("Devnet genesis differs");
    if (manifest.cluster === "localnet" && ["EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG", "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d", "4uhcVJyU9pJkvQyS88uRDiswHXSCkY3zQawwpjk2NsNY"].includes(manifest.genesisHash)) throw new Error("Public cluster is not localnet");
    return { manifest, manifestSha256: releaseDigest(manifest), environmentKey: releaseDigest([manifest.genesisHash, manifest.programId, manifest.mint.address]) };
  } catch {
    throw new ServiceError("Chain release configuration is invalid", 503, "CHAIN_CONFIG_INVALID");
  }
}
