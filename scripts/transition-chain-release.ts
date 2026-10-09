import { releaseArgs, cliMain } from "./release-cli";
import { readReleaseManifest } from "../lib/blockchain/release-manifest";
import { prepareReleaseTransition, applyReleaseTransition } from "../lib/services/releases/release-transition";
cliMain(async () => {
  const args = releaseArgs(); if (args.manifest) process.env.ESCROW_RELEASE_MANIFEST_PATH = args.manifest;
  if (!args.from || !args.contract) throw new Error("Source manifest and contract required");
  const from = readReleaseManifest(args.from);
  if (!args.apply) { const prepared = await prepareReleaseTransition(args.contract, from); return { candidate: prepared.candidate, approvalSha256: prepared.approvalSha256 }; }
  if (!args.approval || !args.actor) throw new Error("Approval and actor required");
  return applyReleaseTransition({ contractId: args.contract, from, approvalSha256: args.approval, actor: args.actor, batchId: args.batch });
});
