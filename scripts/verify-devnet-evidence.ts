import { dirname, join } from "node:path";
import { releaseArgs, readJson, cliMain } from "./release-cli";
import { verifyDevnetEvidence } from "../lib/blockchain/devnet-evidence";
cliMain(async () => {
  const args = releaseArgs(); if (args.manifest) process.env.ESCROW_RELEASE_MANIFEST_PATH = args.manifest;
  if (!args.evidence) throw new Error("Evidence path required");
  const result = await verifyDevnetEvidence(readJson(args.evidence), join(dirname(args.evidence), "rpc")); if (result.status !== "passed") process.exitCode = 3; return result;
});
