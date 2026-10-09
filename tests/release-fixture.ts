import { Keypair } from "@solana/web3.js";
import { mkdirSync, writeFileSync } from "node:fs";
import { configuredRelease, type ChainReleaseManifest } from "../lib/blockchain/release-manifest";
import { db } from "../lib/db";
export async function initializeTestRelease(overrides: Partial<ChainReleaseManifest> = {}, controlOverrides: { phase?: string; activeManifestSha256?: string; targetManifestSha256?: string } = {}) {
  const address = Keypair.generate().publicKey.toBase58();
  const manifest: ChainReleaseManifest = { schemaVersion: 1, releaseId: "local-test", sourceCommit: "0".repeat(40), cluster: "localnet",
    genesisHash: process.env.ESCROW_NETWORK_GENESIS_HASH || address, programId: process.env.ESCROW_PROGRAM_ID || address, programDataAddress: null,
    programLoader: "BPFLoader2111111111111111111111111111111111", upgradeAuthority: null, deployedSlot: "0", deploymentTxSig: "local-validator-genesis",
    predecessorManifestSha256: null, protocolDescriptorSha256: "0".repeat(64), activationEvidenceSha256: "0".repeat(64),
    artifact: { sha256: "0".repeat(64), byteLength: 1, idlSha256: "0".repeat(64) }, deployedProgram: { sha256: process.env.ESCROW_PROGRAM_SHA256 || "0".repeat(64), payloadLength: 1 },
    mint: { address: process.env.NEXT_PUBLIC_USDC_MINT || address, tokenProgram: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA", decimals: 6, label: "test_usdc" },
    toolchain: { anchor: "test", solana: "test", rust: "test", node: process.version }, verificationEvidence: ["isolated local test fixture"], ...overrides };
  mkdirSync("output/iteration-3/test", { recursive: true });
  const path = `output/iteration-3/test/${manifest.genesisHash}-${manifest.releaseId}.json`;
  writeFileSync(path, JSON.stringify(manifest));
  Object.assign(process.env, { ESCROW_RELEASE_ID: manifest.releaseId, ESCROW_RELEASE_MANIFEST_PATH: path, NEXT_PUBLIC_SOLANA_NETWORK: manifest.cluster,
    ESCROW_NETWORK_GENESIS_HASH: manifest.genesisHash, ESCROW_PROGRAM_ID: manifest.programId, NEXT_PUBLIC_USDC_MINT: manifest.mint.address,
    ESCROW_PROGRAM_SHA256: manifest.deployedProgram.sha256, ESCROW_CHAIN_NEW_OPERATIONS_ENABLED: "true" });
  const release = configuredRelease();
  await db.chainReleaseControl.upsert({ where: { environmentKey: release.environmentKey }, create: { environmentKey: release.environmentKey, genesisHash: manifest.genesisHash,
    programId: manifest.programId, mint: manifest.mint.address, activeManifestSha256: release.manifestSha256, phase: "open", actor: "isolated-test" },
    update: { activeManifestSha256: release.manifestSha256, targetManifestSha256: null, phase: "open", ...controlOverrides } });
  return release;
}
