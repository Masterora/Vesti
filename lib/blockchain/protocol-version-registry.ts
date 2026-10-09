import { readFileSync } from "node:fs";
import { z } from "zod";
import { releaseDigest } from "./release-manifest";
import { ServiceError } from "@/lib/services/errors";
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const descriptor = z.object({
  schemaVersion: z.literal(1), sourceCommit: z.string().regex(/^[a-f0-9]{40}$/), artifactSha256: hash,
  decoder: z.enum(["vesti-v2-plan", "vesti-legacy-no-plan"]),
  semantics: z.literal("classic-spl-fixed-principal-v1"),
  accountLayout: z.literal("escrow-state-v1"),
}).strict();
export const protocolRegistrySchema = z.object({
  schemaVersion: z.literal(1), genesisHash: z.string(), programId: z.string(),
  versions: z.array(z.object({ releaseId: z.string(), manifestSha256: hash, predecessorManifestSha256: hash.nullable(),
    programHash: hash, descriptor, descriptorSha256: hash,
    // A trusted, externally verified activation interval; same-slot uncertainty is explicit.
    startSlot: z.string().regex(/^\d+$/), endSlot: z.string().regex(/^\d+$/).nullable(),
    activationEvidenceSha256: hash, deploymentTxSig: z.string(), ambiguousSlots: z.array(z.string().regex(/^\d+$/)),
  }).strict()).min(1),
}).strict();
export type ProtocolRegistry = z.infer<typeof protocolRegistrySchema>;
export function validateProtocolRegistry(raw: unknown, approvedSha256: string) {
  const registry = protocolRegistrySchema.parse(raw);
  if (releaseDigest(registry) !== approvedSha256) throw new ServiceError("Historical registry is not approved", 409, "PROTOCOL_REGISTRY_UNAPPROVED");
  registry.versions.forEach((v, n) => {
    if (releaseDigest(v.descriptor) !== v.descriptorSha256 || v.predecessorManifestSha256 !== (n ? registry.versions[n - 1].manifestSha256 : null) ||
      (v.endSlot !== null && BigInt(v.endSlot) <= BigInt(v.startSlot)) ||
      (n && registry.versions[n - 1].endSlot !== v.startSlot)) throw new ServiceError("Historical registry is inconsistent", 409, "PROTOCOL_REGISTRY_INVALID");
  });
  return registry;
}
export function configuredProtocolRegistry() {
  if (!process.env.ESCROW_PROTOCOL_REGISTRY_PATH) return null;
  return validateProtocolRegistry(JSON.parse(readFileSync(process.env.ESCROW_PROTOCOL_REGISTRY_PATH, "utf8")), process.env.ESCROW_PROTOCOL_REGISTRY_SHA256 || "");
}
export function historicalDecoderCandidates(registry: ProtocolRegistry, slot: bigint) {
  const candidates = registry.versions.filter((v) => (slot >= BigInt(v.startSlot) && (v.endSlot === null || slot < BigInt(v.endSlot))) || v.ambiguousSlots.includes(slot.toString()));
  if (!candidates.length) throw new ServiceError("Historical protocol version is unknown", 409, "PROTOCOL_VERSION_UNKNOWN");
  if (new Set(candidates.map((v) => v.descriptor.semantics)).size !== 1) throw new ServiceError("Historical protocol semantics are ambiguous", 409, "PROTOCOL_VERSION_AMBIGUOUS");
  return candidates;
}
