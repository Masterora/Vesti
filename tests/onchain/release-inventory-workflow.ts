import { readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { Keypair, Connection, PublicKey, Transaction } from "@solana/web3.js";
import { createMint, getOrCreateAssociatedTokenAccount, mintTo, TOKEN_2022_PROGRAM_ID, getAccount } from "@solana/spl-token";
import assert from "node:assert/strict";
import { initializeTestRelease } from "../release-fixture";
import { db } from "../../lib/db";
import { readProgramHash, protocolInstruction, type ChainContext } from "../../lib/blockchain/chain-protocol";
import { deriveSolanaEscrowAccounts } from "../../lib/blockchain/solana-escrow-accounts";
import { inventoryChainRelease } from "../../lib/blockchain/release-inventory";
import { releaseDigest } from "../../lib/blockchain/release-manifest";
import { inventoryStateDigest, verifyMaintenanceApproval } from "../../lib/services/releases/release-approval";
const connection = new Connection(process.env.VESTI_TEST_RPC_URL!, "finalized");
const programId = new PublicKey("ErFsmiKY7WxjD9ArYmpqjCCUKnTcfzLm6tFpmWdFU9ck");
const fixture = JSON.parse(readFileSync(process.env.VESTI_INVENTORY_WALLETS_PATH!, "utf8"));
const creator = Keypair.fromSecretKey(Uint8Array.from(fixture.creator)), worker = Keypair.fromSecretKey(Uint8Array.from(fixture.worker)), historicalMint = Keypair.fromSecretKey(Uint8Array.from(fixture.mint));
async function final(signature: string) {
  for (let n = 0; n < 100; n++) { const status = (await connection.getSignatureStatuses([signature], { searchTransactionHistory: true })).value[0]; assert.ok(!status?.err); if (status?.confirmationStatus === "finalized") return; await new Promise((r) => setTimeout(r, 300)); }
  throw new Error("Finality unavailable");
}
async function main() {
  await final(await connection.requestAirdrop(creator.publicKey, 10000000000));
  const options = { commitment: "confirmed" as const, preflightCommitment: "confirmed" as const };
  const approvedMint = await createMint(connection, creator, creator.publicKey, null, 6, undefined, options);
  console.log("PASS inventory approved mint");
  const outsideMint = await createMint(connection, creator, creator.publicKey, null, 6, undefined, options);
  console.log("PASS inventory other mint");
  const source = await getOrCreateAssociatedTokenAccount(connection, creator, outsideMint, creator.publicKey, false, "confirmed", options);
  await final(await mintTo(connection, creator, outsideMint, source.address, creator, 1000000, [], options));
  console.log("PASS inventory other-mint source balance");
  await createMint(connection, creator, creator.publicKey, null, 6, historicalMint, options, TOKEN_2022_PROGRAM_ID);
  const oldAccounts = deriveSolanaEscrowAccounts({ contractId: "old-token2022", creator: creator.publicKey, worker: worker.publicKey, usdcMint: historicalMint.publicKey, programId });
  await final(await mintTo(connection, creator, historicalMint.publicKey, oldAccounts.vaultPda, creator, 1000000, [], options, TOKEN_2022_PROGRAM_ID));
  console.log("PASS inventory real Token-2022 vault funding");
  Object.assign(process.env, { ESCROW_ADAPTER_MODE: "onchain", NEXT_PUBLIC_SOLANA_RPC_URL: process.env.VESTI_TEST_RPC_URL, ESCROW_PROGRAM_ID: programId.toBase58(), NEXT_PUBLIC_USDC_MINT: approvedMint.toBase58(), ESCROW_NETWORK_GENESIS_HASH: await connection.getGenesisHash(), ESCROW_PROGRAM_SHA256: await readProgramHash(connection, programId) });
  const release = await initializeTestRelease({ releaseId: "inventory-fixture" });
  const c: ChainContext = { contractId: "outside-db-classic", creator: creator.publicKey.toBase58(), worker: worker.publicKey.toBase58(), actor: creator.publicKey.toBase58(), policy: "bilateral", arbitrator: null, programId: programId.toBase58(), mint: outsideMint.toBase58(), genesisHash: release.manifest.genesisHash, programHash: release.manifest.deployedProgram.sha256, addressScheme: "creator", kind: "fund", amount: "1000000", version: "0", funded: "0", released: "0", refunded: "0", milestones: [{ id: "outside-m1", amountUnits: "1000000" }] };
  const tx = new Transaction({ feePayer: creator.publicKey, recentBlockhash: (await connection.getLatestBlockhash()).blockhash }).add(protocolInstruction(c, true), protocolInstruction(c)); tx.sign(creator); await final(await connection.sendRawTransaction(tx.serialize()));
  const inventory = await inventoryChainRelease();
  const unbound = inventory.accounts.find((a) => a.details.contractId === c.contractId), token2022 = inventory.accounts.find((a) => a.details.contractId === "old-token2022");
  assert.ok(unbound?.compatible && unbound.details.bound === false && unbound.details.approvedMint === false);
  assert.ok(token2022 && !token2022.compatible && token2022.details.tokenProgram === TOKEN_2022_PROGRAM_ID.toBase58());
  assert.ok(inventory.accounts.some((a) => a.layout === "unknown" && !a.compatible)); assert.equal(inventory.compatible, false);
  assert.equal((await getAccount(connection, oldAccounts.vaultPda, "finalized", TOKEN_2022_PROGRAM_ID)).amount, 1000000n);
  const approval = { schemaVersion: 1, manifestSha256: release.manifestSha256, inventoryStateSha256: inventoryStateDigest(inventory), completeQueryAttestation: "isolated validator complete program account query", allProcessesGateAwareEvidence: "isolated test process", verifiedBuildEvidence: "test artifact", activationEvidenceSha256: release.manifest.activationEvidenceSha256, exits: inventory.accounts.map((a) => ({ address: a.address, evidenceSha256: "0".repeat(64) })) };
  await assert.rejects(verifyMaintenanceApproval(approval, releaseDigest(approval)), /incompatible/);
  // A real proxy emulates a silently capped provider. Successful query stays unattested/incomplete.
  const proxy = createServer(async (request, response) => {
    let body = ""; for await (const chunk of request) body += chunk;
    const rpc = JSON.parse(body), result = await (await fetch(process.env.VESTI_TEST_RPC_URL!, { method: "POST", headers: { "Content-Type": "application/json" }, body })).json();
    if (rpc.method === "getProgramAccounts") result.result.value = result.result.value.slice(0, 1);
    response.setHeader("Content-Type", "application/json"); response.end(JSON.stringify(result));
  });
  await new Promise<void>((resolve) => proxy.listen(0, "127.0.0.1", resolve));
  const port = (proxy.address() as { port: number }).port, previous = process.env.SOLANA_SERVER_RPC_URL;
  try { process.env.SOLANA_SERVER_RPC_URL = `http://127.0.0.1:${port}`; const capped = await inventoryChainRelease(); assert.equal(capped.accounts.length, 1); assert.equal(capped.countStatus, "unattested"); }
  finally { process.env.SOLANA_SERVER_RPC_URL = previous; await new Promise<void>((resolve) => proxy.close(() => resolve())); }
  writeFileSync("output/iteration-3/test/inventory-evidence.json", JSON.stringify({ caseId: "D22", network: "localnet", status: "passed", programId: programId.toBase58(), programAccountCount: inventory.accounts.length, actualClassicUnboundEscrow: unbound?.address, token2022FixtureOrigin: "preloaded historical escrow plus real Token-2022 mintTo", token2022VaultUnits: "1000000", unknownAccountRetained: true, cappedRpcCountStatus: "unattested", sameIdUpgradeGateRejected: true }, null, 2));
  console.log("PASS D22 real unbound other-Mint escrow, funded Token-2022 fixture, unknown program layout and capped RPC block upgrade");
}
void main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => db.$disconnect());
