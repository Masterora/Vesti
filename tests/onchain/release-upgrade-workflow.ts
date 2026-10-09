import { deriveLegacyEscrowPda } from "../../lib/blockchain/solana-escrow-accounts";
import { Keypair, Connection, PublicKey, Transaction } from "@solana/web3.js";
import { createMint, getOrCreateAssociatedTokenAccount, mintTo } from "@solana/spl-token";
import { readFileSync, writeFileSync } from "node:fs";
import { spawn, execFileSync } from "node:child_process";
import assert from "node:assert/strict";
import { db } from "../../lib/db";
import { initializeTestRelease } from "../release-fixture";
import { digest, readProgramHash, protocolInstruction, chainIdentity } from "../../lib/blockchain/chain-protocol";
import { createContract } from "../../lib/services/contracts/create-contract";
import { baseChainContext, syncContractChain } from "../../lib/services/transactions/chain-sync";
import { submitMilestoneProof } from "../../lib/services/milestones/submit-milestone-proof";
import { approveMilestone } from "../../lib/services/milestones/approve-milestone";
import { configuredRelease, releaseDigest } from "../../lib/blockchain/release-manifest";
import { prepareReleaseTransition, applyReleaseTransition } from "../../lib/services/releases/release-transition";
import { changeReleasePhase, type ReleasePhase } from "../../lib/services/releases/release-control";
import { inventoryStateDigest } from "../../lib/services/releases/release-approval";
import { candidateFromManifest } from "../../lib/blockchain/release-candidate";
import { inventoryChainRelease } from "../../lib/blockchain/release-inventory";
const connection = new Connection(process.env.VESTI_TEST_RPC_URL!, "finalized");
const programId = new PublicKey("ErFsmiKY7WxjD9ArYmpqjCCUKnTcfzLm6tFpmWdFU9ck");
const creator = Keypair.generate(), worker = Keypair.generate();
const authority = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(process.env.VESTI_UPGRADE_AUTHORITY_PATH!, "utf8"))));
async function final(signature: string) {
  for (let n = 0; n < 150; n++) {
    const s = (await connection.getSignatureStatuses([signature], { searchTransactionHistory: true })).value[0];
    assert.ok(!s?.err, "Chain execution failed"); if (s?.confirmationStatus === "finalized") return;
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error("Finality unavailable");
}
async function fund(id: string) {
  await db.contract.update({ where: { id }, data: { escrowAccount: deriveLegacyEscrowPda(id, programId).address.toBase58() } });
  const context = await baseChainContext(id);
  const tx = new Transaction({ feePayer: creator.publicKey, recentBlockhash: (await connection.getLatestBlockhash()).blockhash }).add(protocolInstruction(context, true, true), protocolInstruction(context, false, true));
  tx.sign(creator); await final(await connection.sendRawTransaction(tx.serialize())); await syncContractChain(id);
}
async function directRelease(id: string, mid: string) {
  await chainIdentity();
  // Use the approved contract roles, changing only the deployed code pin for direct chain construction.
  const context = { ...await baseChainContext(id), kind: "release" as const, milestoneId: mid, actor: creator.publicKey.toBase58(), amount: "400000" };
  const tx = new Transaction({ feePayer: creator.publicKey, recentBlockhash: (await connection.getLatestBlockhash()).blockhash }).add(protocolInstruction(context, false, true));
  tx.sign(creator); const sig = await connection.sendRawTransaction(tx.serialize()); await final(sig); return sig;
}
async function approval() {
  const release = configuredRelease(), inventory = await inventoryChainRelease();
  const evidence = { schemaVersion: 1, manifestSha256: release.manifestSha256, inventoryStateSha256: inventoryStateDigest(inventory),
    completeQueryAttestation: "isolated validator full query", allProcessesGateAwareEvidence: "single upgraded isolated process", verifiedBuildEvidence: "locked local predecessor/candidate build",
    activationEvidenceSha256: release.manifest.activationEvidenceSha256, exits: inventory.accounts.map((a) => ({ address: a.address, evidenceSha256: releaseDigest({ address: a.address, layout: a.layout, localCompatibilityFixture: true }) })) };
  return { evidence, approvalSha256: releaseDigest(evidence) };
}
async function phase(expectedPhase: ReleasePhase, nextPhase: ReleasePhase, extra: Partial<Parameters<typeof changeReleasePhase>[0]> = {}) {
  const control = await db.chainReleaseControl.findUniqueOrThrow({ where: { environmentKey: configuredRelease().environmentKey } });
  return changeReleasePhase({ expectedPhase, nextPhase, expectedEpoch: control.epoch, actor: authority.publicKey.toBase58(), batch: "local-upgrade", ...extra });
}
async function main() {
  for (const wallet of [creator, worker, authority]) await final(await connection.requestAirdrop(wallet.publicKey, 20000000000));
  const mint = await createMint(connection, creator, creator.publicKey, null, 6);
  const token = await getOrCreateAssociatedTokenAccount(connection, creator, mint, creator.publicKey);
  await getOrCreateAssociatedTokenAccount(connection, creator, mint, worker.publicKey);
  await mintTo(connection, creator, mint, token.address, creator, 5000000);
  const program = await connection.getAccountInfo(programId), dataAddress = new PublicKey(program!.data.subarray(4, 36));
  Object.assign(process.env, { ESCROW_ADAPTER_MODE: "onchain", NEXT_PUBLIC_SOLANA_RPC_URL: process.env.VESTI_TEST_RPC_URL, ESCROW_PROGRAM_ID: programId.toBase58(),
    NEXT_PUBLIC_USDC_MINT: mint.toBase58(), ESCROW_NETWORK_GENESIS_HASH: await connection.getGenesisHash(), ESCROW_PROGRAM_SHA256: await readProgramHash(connection, programId) });
  const oldArtifact = readFileSync(process.env.VESTI_UPGRADE_OLD_ARTIFACT!), newArtifact = readFileSync(process.env.VESTI_UPGRADE_NEW_ARTIFACT!);
  assert.notEqual(digest(oldArtifact), digest(newArtifact));
  const oldSourceCommit = execFileSync("git", ["rev-parse", "f436ad4f277229525b03976f00d5fc53176662bb"], { encoding: "utf8" }).trim();
  const descriptor = { schemaVersion: 1, sourceCommit: oldSourceCommit, artifactSha256: digest(oldArtifact), decoder: "vesti-legacy-no-plan", semantics: "classic-spl-fixed-principal-v1", accountLayout: "escrow-state-v1" };
  const old = await initializeTestRelease({ releaseId: "old-release", protocolDescriptorSha256: releaseDigest(descriptor), sourceCommit: execFileSync("git", ["rev-parse", "f436ad4f277229525b03976f00d5fc53176662bb"], { encoding: "utf8" }).trim(), programDataAddress: dataAddress.toBase58(), programLoader: program!.owner.toBase58(), upgradeAuthority: authority.publicKey.toBase58(), artifact: { sha256: digest(oldArtifact), byteLength: oldArtifact.length, idlSha256: "0".repeat(64) } });
  const contracts = [];
  for (let n = 0; n < 2; n++) {
    const c = await createContract({ creatorWallet: creator.publicKey.toBase58(), workerWallet: worker.publicKey.toBase58(), title: `Upgrade case ${n}`, totalAmount: "1", milestones: [{ title: "First", amount: "0.4" }, { title: "Second", amount: "0.6" }] });
    await fund(c.id); await submitMilestoneProof({ contractId: c.id, milestoneId: c.milestones[0].id, walletAddress: worker.publicKey.toBase58(), note: "proof" });
    await approveMilestone({ contractId: c.id, milestoneId: c.milestones[0].id, walletAddress: creator.publicKey.toBase58() }); contracts.push(c);
  }
  const oldContext = await baseChainContext(contracts[0].id);
  await phase("open", "draining");
  await phase("draining", "frozen", await approval());
  const staleDeploymentApproval = await approval();
  const newDescriptor = { ...descriptor, sourceCommit: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(), decoder: "vesti-v2-plan", artifactSha256: digest(newArtifact) };
  const candidate = candidateFromManifest({ ...old.manifest, releaseId: "new-release", sourceCommit: newDescriptor.sourceCommit, predecessorManifestSha256: old.manifestSha256,
    protocolDescriptorSha256: releaseDigest(newDescriptor), artifact: { sha256: digest(newArtifact), byteLength: newArtifact.length, idlSha256: digest(readFileSync("target/idl/vesti_escrow.json")) } });
  const deployInputs = { candidate, candidateApprovalSha256: releaseDigest(candidate) };
  // A legitimate direct payment while DB writes are stopped must be included by conversion.
  const directSig = await directRelease(contracts[0].id, contracts[0].milestones[0].id);
  await assert.rejects(phase("frozen", "deploying", { ...staleDeploymentApproval, ...deployInputs }), /Inventory changed/);
  assert.equal((await db.chainReleaseControl.findUniqueOrThrow({ where: { environmentKey: old.environmentKey } })).phase, "frozen");
  await phase("frozen", "deploying", { ...await approval(), ...deployInputs });
  console.log("PASS actual maintenance phases reject stale frozen inventory and approve receipt-free candidate");
  const deploymentText = await new Promise<string>((resolve, reject) => {
    let output = ""; const child = spawn("solana", ["program", "deploy", process.env.VESTI_UPGRADE_NEW_ARTIFACT!, "--program-id", programId.toBase58(), "--upgrade-authority", process.env.VESTI_UPGRADE_AUTHORITY_PATH!, "--keypair", process.env.VESTI_UPGRADE_AUTHORITY_PATH!, "--url", process.env.VESTI_TEST_RPC_URL!, "--output", "json"], { stdio: ["ignore", "pipe", "pipe"] });
    child.stdout.on("data", (chunk) => { output += chunk.toString(); }); child.stderr.on("data", () => {});
    child.on("exit", (code) => code === 0 ? resolve(output) : reject(new Error("Local program upgrade failed"))); child.on("error", reject);
  });
  const deployment = JSON.parse(deploymentText); const signature = deployment.signature as string; assert.ok(signature); await final(signature);
  const data = await connection.getAccountInfo(dataAddress), slot = data!.data.readBigUInt64LE(4);
  process.env.ESCROW_PROGRAM_SHA256 = await readProgramHash(connection, programId);
  const activationProof = { loader: program!.owner.toBase58(), deploymentSig: signature, deployedSlot: slot.toString(), effectiveSlot: (slot + 1n).toString(), rule: "DELAY_VISIBILITY_SLOT_OFFSET=1", runtime: (await connection.getVersion())["solana-core"] };
  const activationDigest = releaseDigest(activationProof);
  const nextManifest = { ...old.manifest, ...candidate, activationEvidenceSha256: activationDigest, deployedSlot: slot.toString(), deploymentTxSig: signature,
    deployedProgram: { sha256: process.env.ESCROW_PROGRAM_SHA256!, payloadLength: data!.data.length - 45 } };
  const manifestPath = "output/iteration-3/test/new-deployed-release.json";
  writeFileSync(manifestPath, JSON.stringify(nextManifest));
  Object.assign(process.env, { ESCROW_RELEASE_ID: nextManifest.releaseId, ESCROW_RELEASE_MANIFEST_PATH: manifestPath });
  const next = configuredRelease();
  await phase("deploying", "rebinding", { targetManifestSha256: next.manifestSha256, artifactPath: process.env.VESTI_UPGRADE_NEW_ARTIFACT!, idlPath: "target/idl/vesti_escrow.json" });
  console.log("PASS actual finalized loader receipt binds to original candidate before rebinding");
  const registry = { schemaVersion: 1, genesisHash: old.manifest.genesisHash, programId: programId.toBase58(), versions: [
    { releaseId: old.manifest.releaseId, manifestSha256: old.manifestSha256, predecessorManifestSha256: null, programHash: old.manifest.deployedProgram.sha256, descriptor, descriptorSha256: releaseDigest(descriptor), startSlot: "0", endSlot: (slot + 1n).toString(), activationEvidenceSha256: "0".repeat(64), deploymentTxSig: "genesis", ambiguousSlots: [slot.toString()] },
    { releaseId: next.manifest.releaseId, manifestSha256: next.manifestSha256, predecessorManifestSha256: old.manifestSha256, programHash: next.manifest.deployedProgram.sha256, descriptor: newDescriptor, descriptorSha256: releaseDigest(newDescriptor), startSlot: (slot + 1n).toString(), endSlot: null, activationEvidenceSha256: activationDigest, deploymentTxSig: signature, ambiguousSlots: [slot.toString()] },
  ] };
  const registryPath = "output/iteration-3/test/upgrade-registry.json"; writeFileSync(registryPath, JSON.stringify(registry));
  Object.assign(process.env, { ESCROW_PROTOCOL_REGISTRY_PATH: registryPath, ESCROW_PROTOCOL_REGISTRY_SHA256: releaseDigest(registry) });
  const conversion = await prepareReleaseTransition(contracts[0].id, old.manifest);
  assert.equal(conversion.snapshot.released, 400000n); assert.ok(conversion.snapshot.instructions.some((e) => e.txSig === directSig));
  const beforeEvents = await db.event.count({ where: { contractId: contracts[0].id } });
  // DB trigger fails at audit insertion, after projection and binding, proving complete SQL rollback.
  await db.$executeRawUnsafe(`CREATE FUNCTION reject_release_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected audit failure'; END $$`);
  await db.$executeRawUnsafe(`CREATE TRIGGER reject_release_audit BEFORE INSERT ON "ChainReleaseTransition" FOR EACH ROW EXECUTE FUNCTION reject_release_audit()`);
  await assert.rejects(applyReleaseTransition({ contractId: contracts[0].id, from: old.manifest, approvalSha256: conversion.approvalSha256, actor: authority.publicKey.toBase58() }));
  assert.equal((await db.contract.findUniqueOrThrow({ where: { id: contracts[0].id } })).releasedAmount.toString(), "0");
  assert.equal(await db.event.count({ where: { contractId: contracts[0].id } }), beforeEvents);
  await db.$executeRawUnsafe('DROP TRIGGER reject_release_audit ON "ChainReleaseTransition"');
  const applied = await applyReleaseTransition({ contractId: contracts[0].id, from: old.manifest, approvalSha256: conversion.approvalSha256, actor: authority.publicKey.toBase58() });
  assert.equal((await applyReleaseTransition({ contractId: contracts[0].id, from: old.manifest, approvalSha256: conversion.approvalSha256, actor: authority.publicKey.toBase58() })).id, applied.id);
  assert.equal((await db.contract.findUniqueOrThrow({ where: { id: contracts[0].id } })).releasedAmount.toString(), "0.4");
  assert.equal((await db.chainReleaseControl.findUniqueOrThrow({ where: { environmentKey: next.environmentKey } })).phase, "rebinding");
  await assert.rejects(syncContractChain(contracts[0].id), /invalid|paused/);
  // More direct activity on an already-converted contract must receive a separate immutable batch approval.
  const updatedContext = await baseChainContext(contracts[0].id);
  const secondMid = contracts[0].milestones[1].id;
  for (const [kind, actor, extra] of [
    ["dispute_open", worker, { version: "0", amount: "0", reasonHash: digest("maintenance incremental dispute") }],
    ["dispute_propose", creator, { version: "0", amount: "0", outcome: "refund_to_creator" }],
    ["dispute_accept_refund", worker, { version: "1", amount: "600000", outcome: "refund_to_creator" }],
  ] as const) {
    const tx = new Transaction({ feePayer: actor.publicKey, recentBlockhash: (await connection.getLatestBlockhash()).blockhash }).add(protocolInstruction({ ...updatedContext, ...extra, kind, actor: actor.publicKey.toBase58(), milestoneId: secondMid }));
    tx.sign(actor); await final(await connection.sendRawTransaction(tx.serialize()));
  }
  const increment = await prepareReleaseTransition(contracts[0].id, old.manifest);
  assert.equal(increment.snapshot.refunded, 600000n);
  await assert.rejects(applyReleaseTransition({ contractId: contracts[0].id, from: old.manifest, approvalSha256: conversion.approvalSha256, actor: authority.publicKey.toBase58(), batchId: "increment-1" }), /changed/);
  const batch = await applyReleaseTransition({ contractId: contracts[0].id, from: old.manifest, approvalSha256: increment.approvalSha256, actor: authority.publicKey.toBase58(), batchId: "increment-1" });
  assert.equal((await applyReleaseTransition({ contractId: contracts[0].id, from: old.manifest, approvalSha256: increment.approvalSha256, actor: authority.publicKey.toBase58(), batchId: "increment-1" })).id, batch.id);
  assert.equal((await db.contract.findUniqueOrThrow({ where: { id: contracts[0].id } })).refundedAmount.toString(), "0.6");
  const other = await prepareReleaseTransition(contracts[1].id, old.manifest);
  await applyReleaseTransition({ contractId: contracts[1].id, from: old.manifest, approvalSha256: other.approvalSha256, actor: authority.publicKey.toBase58() });
  await phase("rebinding", "open", await approval());
  console.log("PASS real maintenance open gate after conversion and fresh inventory approval");
  const synced = await syncContractChain(contracts[0].id); assert.equal(synced.released, 400000n);
  assert.equal(oldContext.programHash, old.manifest.deployedProgram.sha256);
  const inventory = await inventoryChainRelease(); assert.ok(inventory.accounts.length > 0); assert.equal(inventory.countStatus, "unattested"); assert.ok(inventory.compatible);
  writeFileSync("output/iteration-3/test/upgrade-evidence.json", JSON.stringify({ deploymentSig: signature, slot: slot.toString(), oldManifestSha256: old.manifestSha256, newManifestSha256: configuredRelease().manifestSha256, directSig, caseIds: ["D20", "D21", "D23"], registrySha256: releaseDigest(registry), activationProof, inventoryState: inventory.countStatus,
    maintenancePhasesViaService: true, staleFrozenInventoryRejected: true, approvedCandidateSha256: releaseDigest(candidate), finalizedReceiptVerified: true, freshOpenApprovalVerified: true }, null, 2));
  console.log("PASS real same-ID upgrade, direct payment conversion, atomic rollback, exact retry and ordinary historical sync");
}
void main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => db.$disconnect());
