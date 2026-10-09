import { releaseArgs, readJson, cliMain } from "./release-cli";
import { configuredRelease } from "../lib/blockchain/release-manifest";
import { currentReleaseControl, changeReleasePhase, releasePhases, type ReleasePhase } from "../lib/services/releases/release-control";
import { db } from "../lib/db";
cliMain(async () => {
  const args = releaseArgs(); if (args.manifest) process.env.ESCROW_RELEASE_MANIFEST_PATH = args.manifest;
  if (!args.apply) return currentReleaseControl();
  if (!args.actor || !args.batch) throw new Error("Actor and maintenance batch required");
  if (args.initialize) {
    const release = configuredRelease();
    // Initialization always creates draining, even on a fresh environment.
    return db.chainReleaseControl.create({ data: { environmentKey: release.environmentKey, genesisHash: release.manifest.genesisHash, programId: release.manifest.programId,
      mint: release.manifest.mint.address, phase: "draining", activeManifestSha256: release.manifestSha256, actor: args.actor, maintenanceBatch: args.batch } });
  }
  if (!releasePhases.includes(args.phase as ReleasePhase) || !releasePhases.includes(args.next as ReleasePhase) || !/^\d+$/.test(args.epoch || "")) throw new Error("Phase and epoch required");
  return changeReleasePhase({ expectedPhase: args.phase as ReleasePhase, expectedEpoch: BigInt(args.epoch!), nextPhase: args.next as ReleasePhase,
    actor: args.actor, batch: args.batch, targetManifestSha256: args.target, evidence: args.evidence ? readJson(args.evidence) : undefined, approvalSha256: args.approval,
    candidate: args.candidate ? readJson(args.candidate) : undefined, candidateApprovalSha256: args["candidate-approval"], artifactPath: args.artifact, idlPath: args.idl });
});
