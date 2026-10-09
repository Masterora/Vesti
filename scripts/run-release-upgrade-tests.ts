import { generateReleaseInventoryFixtures } from "../tests/onchain/generate-release-inventory-fixtures";
import "dotenv/config";
import { spawn, execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, copyFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { Keypair, Connection, PublicKey } from "@solana/web3.js";
import { PrismaClient } from "@prisma/client";
const inventoryOnly = process.argv.includes("--inventory");
const programId = "ErFsmiKY7WxjD9ArYmpqjCCUKnTcfzLm6tFpmWdFU9ck";
const root = mkdtempSync(`${tmpdir()}/vesti-upgrade-`);
const authority = Keypair.generate();
const authorityPath = `${root}/authority.json`;
writeFileSync(authorityPath, JSON.stringify([...authority.secretKey]), { mode: 0o600 });
const url = new URL(process.env.DATABASE_URL!); url.searchParams.set("schema", "vesti_release_upgrade_test");
const db = new PrismaClient({ datasourceUrl: url.toString() });
const environment = { ...process.env, CARGO_TARGET_DIR: `${process.cwd()}/programs/vesti-escrow/target`, DATABASE_URL: url.toString(), VESTI_TEST_RPC_URL: "http://127.0.0.1:19899", SOLANA_SERVER_RPC_URL: "http://127.0.0.1:19899", VESTI_UPGRADE_AUTHORITY_PATH: authorityPath,
  VESTI_UPGRADE_OLD_ARTIFACT: `${root}/old/deploy/vesti_escrow.so`, VESTI_UPGRADE_NEW_ARTIFACT: `${process.cwd()}/programs/vesti-escrow/target/deploy/vesti_escrow.so` };
async function run(command: string, args: string[]) {
  await new Promise<void>((resolve, reject) => { const child = spawn(command, args, { env: environment, stdio: "inherit" }); child.on("error", reject); child.on("exit", (code) => code === 0 ? resolve() : reject(new Error("Local upgrade test command failed"))); });
}
async function main() {
  if (!inventoryOnly) {
  mkdirSync(`${root}/old/src`, { recursive: true });
  copyFileSync("programs/vesti-escrow/Cargo.toml", `${root}/old/Cargo.toml`);
  copyFileSync("programs/vesti-escrow/Cargo.lock", `${root}/old/Cargo.lock`);
  // Compile the actual predecessor, preserving its legacy account and instruction layouts.
  const source = execFileSync("git", ["show", "f436ad4f277229525b03976f00d5fc53176662bb:programs/vesti-escrow/src/lib.rs"], { encoding: "utf8" });
  writeFileSync(`${root}/old/src/lib.rs`, source);
  await run("cargo", ["build-sbf", "--manifest-path", `${root}/old/Cargo.toml`, "--sbf-out-dir", `${root}/old/deploy`]);
  }
  const fixtures = inventoryOnly ? generateReleaseInventoryFixtures(root, new PublicKey(programId)) : null;
  if (inventoryOnly) environment.VESTI_UPGRADE_OLD_ARTIFACT = environment.VESTI_UPGRADE_NEW_ARTIFACT;
  Object.assign(environment, fixtures ? { VESTI_INVENTORY_WALLETS_PATH: fixtures } : {});
  const log = `${root}/validator.log`;
  const validator = spawn("solana-test-validator", ["--reset", "--ledger", `${root}/ledger`, "--rpc-port", "19899", "--faucet-port", "19902", "--gossip-port", "19901", "--dynamic-port-range", "19910-19980", "--bind-address", "127.0.0.1", "--ticks-per-slot", "16", "--upgradeable-program", programId, environment.VESTI_UPGRADE_OLD_ARTIFACT, authority.publicKey.toBase58(), ...(inventoryOnly ? ["--account-dir", `${root}/accounts`] : [])], { stdio: ["ignore", "ignore", "ignore"] });
  try {
    const connection = new Connection(environment.VESTI_TEST_RPC_URL);
    let ready = false;
    for (let n = 0; n < 60; n++) { try { await connection.getVersion(); ready = true; break; } catch { await new Promise((r) => setTimeout(r, 500)); } }
    if (!ready) throw new Error(`Validator unavailable: ${log}`);
    await db.$executeRawUnsafe('DROP SCHEMA IF EXISTS "vesti_release_upgrade_test" CASCADE');
    await run("corepack", ["pnpm", "prisma", "migrate", "deploy"]);
    await run("corepack", ["pnpm", "exec", "tsx", inventoryOnly ? "tests/onchain/release-inventory-workflow.ts" : "tests/onchain/release-upgrade-workflow.ts"]);
  } finally {
    validator.kill("SIGTERM"); await new Promise<void>((resolve) => validator.once("exit", () => resolve()));
    await db.$executeRawUnsafe('DROP SCHEMA IF EXISTS "vesti_release_upgrade_test" CASCADE');
    await db.$disconnect(); rmSync(root, { recursive: true, force: true });
  }
}
void main().catch(() => { console.error("Local release upgrade validation failed"); process.exitCode = 1; });
