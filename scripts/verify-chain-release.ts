import { releaseArgs, cliMain } from "./release-cli";
import { verifyReleaseArtifact } from "../lib/blockchain/release-verification";
cliMain(async () => {
  const args = releaseArgs(); if (args.manifest) process.env.ESCROW_RELEASE_MANIFEST_PATH = args.manifest;
  if (!args.artifact || !args.idl) throw new Error("Artifact and IDL required");
  return verifyReleaseArtifact(args.artifact, args.idl);
});
