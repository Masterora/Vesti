import { releaseArgs, cliMain } from "./release-cli";
import { inventoryChainRelease } from "../lib/blockchain/release-inventory";
import { inventoryStateDigest } from "../lib/services/releases/release-approval";
cliMain(async () => {
  const args = releaseArgs(); if (args.manifest) process.env.ESCROW_RELEASE_MANIFEST_PATH = args.manifest;
  const inventory = await inventoryChainRelease();
  process.exitCode = inventory.compatible ? 3 : 1; // Unattested completeness is never pass.
  return { ...inventory, inventoryStateSha256: inventoryStateDigest(inventory) };
});
