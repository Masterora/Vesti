import { releaseManifestSchema, releaseDigest, type ChainReleaseManifest } from "./release-manifest";
import { assertState } from "@/lib/services/errors";

// Deployment observations are receipts, not inputs to pre-deployment approval.
const receiptFields = new Set(["deployedSlot", "deploymentTxSig", "activationEvidenceSha256", "deployedProgram"]);
export const releaseCandidateSchema = releaseManifestSchema.omit({ deployedSlot: true, deploymentTxSig: true, activationEvidenceSha256: true, deployedProgram: true }).strict();
export function candidateFromManifest(manifest: ChainReleaseManifest) {
  return releaseCandidateSchema.parse(Object.fromEntries(Object.entries(manifest).filter(([key]) => !receiptFields.has(key))));
}
export function approveReleaseCandidate(raw: unknown, approvedSha256: string, active: ChainReleaseManifest) {
  const candidate = releaseCandidateSchema.parse(raw);
  assertState(releaseDigest(candidate) === approvedSha256, "Deployment candidate approval differs");
  assertState(candidate.predecessorManifestSha256 === releaseDigest(active) && candidate.releaseId !== active.releaseId, "Deployment candidate predecessor differs");
  assertState(candidate.cluster === active.cluster && candidate.genesisHash === active.genesisHash && candidate.programId === active.programId &&
    candidate.programDataAddress === active.programDataAddress && candidate.programLoader === active.programLoader && candidate.upgradeAuthority === active.upgradeAuthority &&
    releaseDigest(candidate.mint) === releaseDigest(active.mint), "Deployment candidate cannot change chain, loader, authority or asset");
  return candidate;
}
