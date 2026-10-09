import { describe, expect, it } from "vitest";
import { Keypair } from "@solana/web3.js";
import { releaseManifestSchema, releaseDigest } from "./release-manifest";
import { approveReleaseCandidate, candidateFromManifest, releaseCandidateSchema } from "./release-candidate";
const address = Keypair.generate().publicKey.toBase58();
const active = releaseManifestSchema.parse({ schemaVersion: 1, releaseId: "old", sourceCommit: "a".repeat(40), cluster: "localnet", genesisHash: address, programId: address,
  programDataAddress: address, programLoader: address, upgradeAuthority: address, deployedSlot: "1", deploymentTxSig: "old-tx", predecessorManifestSha256: null,
  protocolDescriptorSha256: "a".repeat(64), activationEvidenceSha256: "a".repeat(64), artifact: { sha256: "a".repeat(64), byteLength: 100, idlSha256: "a".repeat(64) },
  deployedProgram: { sha256: "a".repeat(64), payloadLength: 200 }, mint: { address, tokenProgram: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA", decimals: 6, label: "test_usdc" },
  toolchain: { anchor: "1", solana: "1", rust: "1", node: "1" }, verificationEvidence: ["locked build"] });
const target = { ...active, releaseId: "new", sourceCommit: "b".repeat(40), predecessorManifestSha256: releaseDigest(active), artifact: { ...active.artifact, sha256: "b".repeat(64) } };
describe("pre-deployment candidate versus finalized receipt", () => {
  it("approves the locked candidate before receipt fields exist and binds the final build", () => {
    const candidate = candidateFromManifest(target), digest = releaseDigest(candidate);
    expect(approveReleaseCandidate(candidate, digest, active)).toEqual(candidate);
    const deployed = { ...target, deploymentTxSig: "actual-tx", deployedSlot: "500", activationEvidenceSha256: "c".repeat(64), deployedProgram: { sha256: "c".repeat(64), payloadLength: 300 } };
    expect(releaseDigest(candidateFromManifest(deployed))).toBe(digest);
    expect(releaseDigest(candidateFromManifest({ ...deployed, sourceCommit: "c".repeat(40) }))).not.toBe(digest);
    expect(releaseDigest(candidateFromManifest({ ...deployed, artifact: { ...deployed.artifact, sha256: "c".repeat(64) } }))).not.toBe(digest);
  });
  it("rejects a changed authority, predecessor or asset even with a recomputed digest", () => {
    const candidate = candidateFromManifest(target);
    for (const altered of [{ ...candidate, upgradeAuthority: null }, { ...candidate, predecessorManifestSha256: "c".repeat(64) }, { ...candidate, mint: { ...candidate.mint, address: Keypair.generate().publicKey.toBase58() } }])
      expect(() => approveReleaseCandidate(altered, releaseDigest(altered), active)).toThrow();
    expect(() => approveReleaseCandidate(candidate, "0".repeat(64), active)).toThrow("approval");
  });
  it("does not accept invented deployment results or credential fields in a candidate", () => {
    expect(releaseCandidateSchema.safeParse(target).success).toBe(false);
    expect(releaseCandidateSchema.safeParse({ ...candidateFromManifest(target), privateKey: "forbidden" }).success).toBe(false);
  });
});
