import { describe, it, expect, afterEach, vi } from "vitest";
import { Keypair } from "@solana/web3.js";
import { writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { canonicalJson, configuredRelease, releaseManifestSchema, releaseDigest } from "./release-manifest";
const dir = mkdtempSync(`${tmpdir()}/vesti-manifest-`);
const address = Keypair.generate().publicKey.toBase58();
export const manifestFixture = { schemaVersion: 1, releaseId: "r3", sourceCommit: "a".repeat(40), cluster: "localnet", genesisHash: address, programId: address,
  programDataAddress: null, programLoader: address, upgradeAuthority: null, deployedSlot: "9007199254740993", deploymentTxSig: "fixture", predecessorManifestSha256: null,
  protocolDescriptorSha256: "0".repeat(64), activationEvidenceSha256: "0".repeat(64), artifact: { sha256: "0".repeat(64), byteLength: 1, idlSha256: "0".repeat(64) },
  deployedProgram: { sha256: "0".repeat(64), payloadLength: 1 }, mint: { address, tokenProgram: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA", decimals: 6, label: "test_usdc" },
  toolchain: { anchor: "1", solana: "1", rust: "1", node: "1" }, verificationEvidence: ["fixture"] };
afterEach(() => { vi.unstubAllEnvs(); rmSync(`${dir}/manifest.json`, { force: true }); });
describe("release manifest", () => {
  it("canonicalizes key order without changing u64 strings", () => {
    expect(canonicalJson({ b: "9007199254740993", a: 1 })).toBe('{"a":1,"b":"9007199254740993"}');
    expect(releaseDigest({ b: 2, a: 1 })).toBe(releaseDigest({ a: 1, b: 2 }));
  });
  it("rejects extra credential fields and wrong token program", () => {
    expect(releaseManifestSchema.safeParse({ ...manifestFixture, privateKey: "secret" }).success).toBe(false);
    expect(releaseManifestSchema.safeParse({ ...manifestFixture, mint: { ...manifestFixture.mint, decimals: 9 } }).success).toBe(false);
  });
  it("requires manifest, environment and network agreement", () => {
    writeFileSync(`${dir}/manifest.json`, JSON.stringify(manifestFixture));
    for (const [key, value] of Object.entries({ ESCROW_RELEASE_MANIFEST_PATH: `${dir}/manifest.json`, ESCROW_RELEASE_ID: "r3", NEXT_PUBLIC_SOLANA_NETWORK: "localnet", ESCROW_NETWORK_GENESIS_HASH: address, ESCROW_PROGRAM_ID: address, NEXT_PUBLIC_USDC_MINT: address, ESCROW_PROGRAM_SHA256: "0".repeat(64) })) vi.stubEnv(key, value);
    expect(configuredRelease().manifest.deployedSlot).toBe("9007199254740993");
    vi.stubEnv("NEXT_PUBLIC_SOLANA_NETWORK", "mainnet-beta"); expect(() => configuredRelease()).toThrow("invalid");
    vi.stubEnv("NEXT_PUBLIC_SOLANA_NETWORK", "devnet"); expect(() => configuredRelease()).toThrow("invalid");
  });
});
