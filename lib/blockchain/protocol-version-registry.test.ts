import { describe, it, expect } from "vitest";
import { validateProtocolRegistry, historicalDecoderCandidates } from "./protocol-version-registry";
import { releaseDigest } from "./release-manifest";
const descriptor = { schemaVersion: 1, sourceCommit: "a".repeat(40), artifactSha256: "b".repeat(64), decoder: "vesti-v2-plan", semantics: "classic-spl-fixed-principal-v1", accountLayout: "escrow-state-v1" };
const registry = { schemaVersion: 1, genesisHash: "g", programId: "p", versions: [{ releaseId: "old", manifestSha256: "1".repeat(64), predecessorManifestSha256: null, programHash: "3".repeat(64), descriptor, descriptorSha256: releaseDigest(descriptor), startSlot: "0", endSlot: "100", activationEvidenceSha256: "4".repeat(64), deploymentTxSig: "deploy-old", ambiguousSlots: ["100"] },
  { releaseId: "new", manifestSha256: "2".repeat(64), predecessorManifestSha256: "1".repeat(64), programHash: "5".repeat(64), descriptor, descriptorSha256: releaseDigest(descriptor), startSlot: "100", endSlot: null, activationEvidenceSha256: "6".repeat(64), deploymentTxSig: "deploy-new", ambiguousSlots: ["100"] }] };
describe("trusted protocol selection", () => {
  it("selects the exact interval and exposes all ambiguous candidates", () => {
    const approved = validateProtocolRegistry(registry, releaseDigest(registry));
    expect(historicalDecoderCandidates(approved, 99n).map((v) => v.releaseId)).toEqual(["old"]);
    expect(historicalDecoderCandidates(approved, 100n).map((v) => v.releaseId)).toEqual(["old", "new"]);
    expect(historicalDecoderCandidates(approved, 101n).map((v) => v.releaseId)).toEqual(["new"]);
  });
  it("rejects tampered registry, broken provenance and unknown semantics", () => {
    expect(() => validateProtocolRegistry(registry, "0".repeat(64))).toThrow("not approved");
    const broken = structuredClone(registry); broken.versions[1].predecessorManifestSha256 = "9".repeat(64);
    expect(() => validateProtocolRegistry(broken, releaseDigest(broken))).toThrow("inconsistent");
    const unknown = structuredClone(registry); unknown.versions[0].descriptor.semantics = "unknown";
    expect(() => validateProtocolRegistry(unknown, releaseDigest(unknown))).toThrow();
  });
});
