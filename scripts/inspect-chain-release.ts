import { releaseArgs, cliMain, readJson } from "./release-cli";
import { configuredRelease, releaseDigest } from "../lib/blockchain/release-manifest";
import { approveReleaseCandidate, releaseCandidateSchema } from "../lib/blockchain/release-candidate";
import { chainIdentity } from "../lib/blockchain/chain-protocol";
import { currentReleaseControl } from "../lib/services/releases/release-control";
cliMain(async () => {
  const args = releaseArgs();
  if (args.manifest) process.env.ESCROW_RELEASE_MANIFEST_PATH = args.manifest;
  if (args.candidate) {
    const release = configuredRelease(), candidate = releaseCandidateSchema.parse(readJson(args.candidate));
    const candidateSha256 = releaseDigest(candidate);
    approveReleaseCandidate(candidate, candidateSha256, release.manifest);
    return { status: "candidate_preview", candidate, candidateSha256, activeManifestSha256: release.manifestSha256 };
  }
  const release = configuredRelease(), identity = await chainIdentity(), control = await currentReleaseControl();
  return { status: control ? "inspected" : "blocked", releaseId: release.manifest.releaseId, manifestSha256: release.manifestSha256, genesisHash: identity.genesisHash, programId: identity.programId.toBase58(), programHash: identity.programHash, mint: identity.mint.toBase58(), control };
});
