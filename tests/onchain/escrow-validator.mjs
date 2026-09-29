import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  Connection, Keypair, PublicKey, SystemProgram, Transaction,
  TransactionInstruction, sendAndConfirmTransaction,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID, createAssociatedTokenAccount, createMint,
  freezeAccount, getAccount, mintTo,
} from "@solana/spl-token";
import transactions from "../../lib/blockchain/solana-escrow-transactions.ts";
import reconciliation from "../../lib/blockchain/solana-escrow-reconciliation.ts";
const { prepareFundEscrowTransaction } = transactions;
const { reconcileFundEscrowTransaction } = reconciliation;

const connection = new Connection(process.env.VESTI_TEST_RPC_URL, "confirmed");
const programId = new PublicKey("ErFsmiKY7WxjD9ArYmpqjCCUKnTcfzLm6tFpmWdFU9ck");
const hash = (value) => createHash("sha256").update(value).digest();
const discriminator = (name) => hash(`global:${name}`).subarray(0, 8);
const u64 = (value) => { const bytes = Buffer.alloc(8); bytes.writeBigUInt64LE(BigInt(value)); return bytes; };
const string = (value) => { const bytes = Buffer.from(value); const len = Buffer.alloc(4); len.writeUInt32LE(bytes.length); return Buffer.concat([len, bytes]); };
const meta = (pubkey, isWritable = false, isSigner = false) => ({ pubkey, isWritable, isSigner });
const pda = (...seeds) => PublicKey.findProgramAddressSync(seeds, programId)[0];
const escrowPda = (id) => pda(Buffer.from("escrow"), Buffer.from(id));
const vaultPda = (id) => pda(Buffer.from("vault"), Buffer.from(id));
const disputePda = (escrow, milestoneHash) => pda(Buffer.from("dispute"), escrow.toBuffer(), milestoneHash);
const receiptPda = (escrow, milestoneHash) => pda(Buffer.from("release"), escrow.toBuffer(), milestoneHash);
const policyPda = (escrow) => pda(Buffer.from("policy"), escrow.toBuffer());

function ix(name, keys, ...args) {
  return new TransactionInstruction({ programId, keys, data: Buffer.concat([discriminator(name), ...args]) });
}

async function send(payer, instruction, signers = []) {
  return sendAndConfirmTransaction(connection, new Transaction().add(instruction), [payer, ...signers], {
    commitment: "confirmed",
  });
}

async function expectFailure(label, operation, fixture) {
  const before = await snapshot(fixture);
  let failed = false;
  try { await operation(); } catch (error) {
    failed = true;
    const logs = typeof error.getLogs === "function" ? await error.getLogs(connection) : error.logs;
    console.log(`FAIL EXPECTED ${label}: ${logs?.at(-1) || String(error).slice(0, 180)}`);
  }
  assert.ok(failed, `${label} unexpectedly succeeded`);
  assert.deepEqual(await snapshot(fixture), before, `${label} changed escrow or token balances`);
}

async function escrowState(address) {
  const account = await connection.getAccountInfo(address, "confirmed");
  assert.ok(account, "escrow account missing");
  const data = account.data;
  const idLength = data.readUInt32LE(8);
  const offset = 12 + idLength;
  return {
    funded: data.readBigUInt64LE(offset + 136),
    released: data.readBigUInt64LE(offset + 144),
    status: data[offset + 152],
  };
}

async function disputeState(address) {
  const account = await connection.getAccountInfo(address, "confirmed");
  if (!account) return null;
  const data = account.data;
  return {
    state: data[136],
    outcome: data[169],
    proposedAmount: data.readBigUInt64LE(170),
    version: data.readBigUInt64LE(178),
    settled: data.readBigUInt64LE(186),
  };
}

async function balance(address) { return (await getAccount(connection, address)).amount; }
async function snapshot(fixture) {
  const { escrow, vault, creatorToken, workerToken, dispute } = fixture;
  return {
    escrow: await escrowState(escrow),
    vault: await balance(vault),
    creator: await balance(creatorToken),
    worker: await balance(workerToken),
    dispute: dispute ? await disputeState(dispute) : null,
  };
}

async function airdrop(wallet) {
  const signature = await connection.requestAirdrop(wallet.publicKey, 10_000_000_000);
  await connection.confirmTransaction(signature, "confirmed");
}

let fixtureNumber = 0;
async function fixture(arbitrated = false) {
  const creator = Keypair.generate(), worker = Keypair.generate(), outsider = Keypair.generate();
  const arbitrator = Keypair.generate();
  await airdrop(creator);
  await airdrop(worker);
  await airdrop(outsider);
  if (arbitrated) await airdrop(arbitrator);
  const id = `validator-${++fixtureNumber}`;
  const escrow = escrowPda(id), vault = vaultPda(id);
  const mint = await createMint(connection, creator, creator.publicKey, creator.publicKey, 6);
  const creatorToken = await createAssociatedTokenAccount(connection, creator, mint, creator.publicKey);
  const workerToken = await createAssociatedTokenAccount(connection, creator, mint, worker.publicKey);
  await mintTo(connection, creator, mint, creatorToken, creator, 100n);
  const policy = policyPda(escrow);
  process.env.NEXT_PUBLIC_SOLANA_RPC_URL = process.env.VESTI_TEST_RPC_URL;
  process.env.ESCROW_PROGRAM_ID = programId.toBase58();
  process.env.NEXT_PUBLIC_USDC_MINT = mint.toBase58();
  const prepared = await prepareFundEscrowTransaction({
    contractId: id,
    creatorWallet: creator.publicKey.toBase58(),
    workerWallet: worker.publicKey.toBase58(),
    amount: "0.0001",
    disputePolicy: arbitrated ? "arbitrator" : "bilateral",
    arbitratorWallet: arbitrated ? arbitrator.publicKey.toBase58() : null,
  });
  assert.equal(prepared.escrowAccount, escrow.toBase58());
  const fundingSignature = await sendAndConfirmTransaction(connection, Transaction.from(Buffer.from(prepared.transaction, "base64")), [creator], {
    commitment: "confirmed",
  });
  await reconcileFundEscrowTransaction({
    txSig: fundingSignature,
    contractId: id,
    creatorWallet: creator.publicKey.toBase58(),
    workerWallet: worker.publicKey.toBase58(),
    totalAmount: "0.0001",
    disputePolicy: arbitrated ? "arbitrator" : "bilateral",
    arbitratorWallet: arbitrated ? arbitrator.publicKey.toBase58() : null,
  });
  return { creator, worker, outsider, arbitrator, policy, id, escrow, vault, mint, creatorToken, workerToken, dispute: null };
}

async function ordinaryRelease(f, milestone, amount) {
  const milestoneHash = hash(milestone);
  await send(f.creator, ix("release_milestone", [
    meta(f.escrow, true), meta(f.creator.publicKey, true, true), meta(f.worker.publicKey),
    meta(f.mint), meta(f.vault, true), meta(f.workerToken, true), meta(TOKEN_PROGRAM_ID),
    meta(receiptPda(f.escrow, milestoneHash), true), meta(SystemProgram.programId),
  ], string(milestone), u64(amount), milestoneHash));
}

async function open(f, milestone, actor = f.creator) {
  const milestoneHash = hash(milestone), reasonHash = hash("validator dispute reason");
  f.dispute = disputePda(f.escrow, milestoneHash);
  const instruction = ix("open_dispute", [
    meta(f.escrow, true), meta(actor.publicKey, true, true), meta(f.dispute, true),
    meta(receiptPda(f.escrow, milestoneHash)), meta(SystemProgram.programId),
  ], string(milestone), milestoneHash, reasonHash);
  await send(actor, instruction);
  assert.equal((await escrowState(f.escrow)).status, 2);
  return { milestoneHash, instruction };
}

function proposeIx(f, actor, outcome, amount, version) {
  return ix("propose_resolution", [
    meta(f.escrow), meta(f.dispute, true), meta(actor.publicKey, false, true),
  ], Buffer.from([outcome]), u64(amount), u64(version));
}

function acceptReleaseIx(f, actor, milestoneHash, amount, version, workerToken = f.workerToken) {
  return ix("accept_release_resolution", [
    meta(f.escrow, true), meta(f.dispute, true), meta(actor.publicKey, true, true),
    meta(f.worker.publicKey), meta(f.mint), meta(f.vault, true), meta(workerToken, true),
    meta(receiptPda(f.escrow, milestoneHash), true), meta(TOKEN_PROGRAM_ID),
    meta(SystemProgram.programId),
  ], u64(version), u64(amount));
}

function acceptRefundIx(f, actor, amount, version) {
  return ix("accept_refund_resolution", [
    meta(f.escrow, true), meta(f.dispute, true), meta(actor.publicKey, false, true),
    meta(f.creator.publicKey), meta(f.mint), meta(f.vault, true),
    meta(f.creatorToken, true), meta(TOKEN_PROGRAM_ID),
  ], u64(version), u64(amount));
}

function arbitrateReleaseIx(f, actor, milestoneHash, amount) {
  return ix("arbitrate_release_resolution", [
    meta(f.escrow, true), meta(f.dispute, true), meta(f.policy),
    meta(actor.publicKey, true, true), meta(f.worker.publicKey), meta(f.mint),
    meta(f.vault, true), meta(f.workerToken, true),
    meta(receiptPda(f.escrow, milestoneHash), true), meta(TOKEN_PROGRAM_ID),
    meta(SystemProgram.programId),
  ], u64(amount));
}

function arbitrateRefundIx(f, actor, amount) {
  return ix("arbitrate_refund_resolution", [
    meta(f.escrow, true), meta(f.dispute, true), meta(f.policy),
    meta(actor.publicKey, false, true), meta(f.creator.publicKey), meta(f.mint),
    meta(f.vault, true), meta(f.creatorToken, true), meta(TOKEN_PROGRAM_ID),
  ], u64(amount));
}

async function testRelease() {
  const f = await fixture();
  const { milestoneHash, instruction } = await open(f, "milestone-a");
  await expectFailure("duplicate dispute", () => send(f.creator, instruction), f);
  await expectFailure("outsider proposal", () => send(f.outsider, proposeIx(f, f.outsider, 1, 60, 0)), f);
  await expectFailure("zero release", () => send(f.creator, proposeIx(f, f.creator, 1, 0, 0)), f);
  await expectFailure("excess release", () => send(f.creator, proposeIx(f, f.creator, 1, 101, 0)), f);
  await send(f.creator, proposeIx(f, f.creator, 1, 60, 0));
  await expectFailure("stale proposal", () => send(f.worker, proposeIx(f, f.worker, 2, 0, 0)), f);
  await expectFailure("self acceptance", () => send(f.creator, acceptReleaseIx(f, f.creator, milestoneHash, 60, 1)), f);
  await expectFailure("wrong recipient", () => send(f.worker, acceptReleaseIx(f, f.worker, milestoneHash, 60, 1, f.creatorToken)), f);
  await expectFailure("wrong expected amount", () => send(f.worker, acceptReleaseIx(f, f.worker, milestoneHash, 61, 1)), f);
  await send(f.worker, acceptReleaseIx(f, f.worker, milestoneHash, 60, 1));
  assert.deepEqual(await snapshot(f), {
    escrow: { funded: 100n, released: 60n, status: 1 },
    vault: 40n, creator: 0n, worker: 60n,
    dispute: { state: 2, outcome: 1, proposedAmount: 60n, version: 1n, settled: 60n },
  });
  assert.ok(await connection.getAccountInfo(receiptPda(f.escrow, milestoneHash)));
  await expectFailure("replay acceptance", () => send(f.worker, acceptReleaseIx(f, f.worker, milestoneHash, 60, 1)), f);
  await expectFailure("ordinary replay", () => ordinaryRelease(f, "milestone-a", 60), f);
  await ordinaryRelease(f, "milestone-b", 40);
  assert.equal((await escrowState(f.escrow)).status, 3);
  assert.equal(await balance(f.vault), 0n);
  console.log("PASS dispute release 60, ordinary release 40, receipt replay protection");
}

async function testRefund() {
  const f = await fixture();
  await ordinaryRelease(f, "milestone-a", 60);
  await open(f, "milestone-b", f.worker);
  await send(f.worker, proposeIx(f, f.worker, 2, 0, 0));
  await expectFailure("self refund acceptance", () => send(f.worker, acceptRefundIx(f, f.worker, 40, 1)), f);
  await expectFailure("wrong refund amount", () => send(f.creator, acceptRefundIx(f, f.creator, 39, 1)), f);
  await send(f.creator, acceptRefundIx(f, f.creator, 40, 1));
  assert.deepEqual(await snapshot(f), {
    escrow: { funded: 100n, released: 60n, status: 4 },
    vault: 0n, creator: 40n, worker: 60n,
    dispute: { state: 2, outcome: 2, proposedAmount: 0n, version: 1n, settled: 40n },
  });
  await expectFailure("replay refund", () => send(f.creator, acceptRefundIx(f, f.creator, 40, 1)), f);
  console.log("PASS partial payment 60, dispute refund 40, cancelled outstanding 0");
}

async function testReplacementAndDirectOpen() {
  const f = await fixture();
  const { milestoneHash } = await open(f, "unlisted-onchain-id", f.worker);
  await send(f.worker, proposeIx(f, f.worker, 2, 0, 0));
  await send(f.creator, proposeIx(f, f.creator, 1, 100, 1));
  await expectFailure("old proposal acceptance", () => send(f.creator, acceptRefundIx(f, f.creator, 100, 1)), f);
  await send(f.worker, acceptReleaseIx(f, f.worker, milestoneHash, 100, 2));
  assert.equal((await escrowState(f.escrow)).status, 3);
  assert.equal(await balance(f.workerToken), 100n);
  console.log("PASS unknown milestone hash freezes escrow, proposal replacement, full release");
}

async function testToken2022Rejected() {
  const payer = Keypair.generate(), worker = Keypair.generate();
  await airdrop(payer);
  const mint = await createMint(connection, payer, payer.publicKey, null, 6, undefined, undefined, TOKEN_2022_PROGRAM_ID);
  const id = `token22-${++fixtureNumber}`;
  const escrow = escrowPda(id), vault = vaultPda(id);
  let failed = false;
  try {
    await send(payer, ix("initialize_escrow", [
      meta(escrow, true), meta(payer.publicKey, true, true), meta(mint), meta(vault, true),
      meta(TOKEN_2022_PROGRAM_ID), meta(SystemProgram.programId),
    ], string(id), worker.publicKey.toBuffer(), u64(100)));
  } catch { failed = true; }
  assert.ok(failed, "Token-2022 mint unexpectedly accepted");
  assert.equal(await connection.getAccountInfo(escrow), null);
  console.log("PASS Token-2022 initialization rejected before escrow creation");
}

async function testCpiFailureRollsBack() {
  const f = await fixture();
  const { milestoneHash } = await open(f, "frozen-vault");
  await send(f.creator, proposeIx(f, f.creator, 1, 100, 0));
  await freezeAccount(connection, f.creator, f.vault, f.mint, f.creator);
  await expectFailure("frozen vault CPI rollback", () =>
    send(f.worker, acceptReleaseIx(f, f.worker, milestoneHash, 100, 1)), f);
  assert.equal(await connection.getAccountInfo(receiptPda(f.escrow, milestoneHash)), null);
  console.log("PASS failed Token CPI leaves dispute, receipt and balances unchanged");
}

async function testExtraVaultTokensExcluded() {
  const f = await fixture();
  await mintTo(connection, f.creator, f.mint, f.vault, f.creator, 7n);
  await open(f, "refund-with-extra");
  await send(f.creator, proposeIx(f, f.creator, 2, 0, 0));
  await send(f.worker, acceptRefundIx(f, f.worker, 100, 1));
  assert.equal(await balance(f.creatorToken), 100n);
  assert.equal(await balance(f.vault), 7n);
  assert.equal((await escrowState(f.escrow)).status, 4);
  console.log("PASS unrelated vault tokens do not increase refundable principal");
}

async function testArbitratorPolicy() {
  const release = await fixture(true);
  assert.ok(await connection.getAccountInfo(release.policy));
  const { milestoneHash } = await open(release, "arbitrated-release");
  await expectFailure("participant cannot arbitrate", () =>
    send(release.creator, arbitrateReleaseIx(release, release.creator, milestoneHash, 60)), release);
  await expectFailure("arbitrator cannot overpay", () =>
    send(release.arbitrator, arbitrateReleaseIx(release, release.arbitrator, milestoneHash, 101)), release);
  await send(release.arbitrator, arbitrateReleaseIx(release, release.arbitrator, milestoneHash, 60));
  assert.equal(await balance(release.workerToken), 60n);
  assert.equal(await balance(release.vault), 40n);
  assert.equal((await escrowState(release.escrow)).status, 1);
  assert.ok(await connection.getAccountInfo(receiptPda(release.escrow, milestoneHash)));
  await expectFailure("arbitration replay", () =>
    send(release.arbitrator, arbitrateReleaseIx(release, release.arbitrator, milestoneHash, 60)), release);

  const refund = await fixture(true);
  await open(refund, "arbitrated-refund");
  await send(refund.creator, proposeIx(refund, refund.creator, 1, 100, 0));
  await expectFailure("arbitrator refund amount mismatch", () =>
    send(refund.arbitrator, arbitrateRefundIx(refund, refund.arbitrator, 99)), refund);
  await send(refund.arbitrator, arbitrateRefundIx(refund, refund.arbitrator, 100));
  assert.equal(await balance(refund.creatorToken), 100n);
  assert.equal(await balance(refund.vault), 0n);
  assert.equal((await escrowState(refund.escrow)).status, 4);

  const bilateral = await fixture();
  assert.equal(await connection.getAccountInfo(bilateral.policy), null);
  const opened = await open(bilateral, "no-arbitrator");
  await expectFailure("bilateral policy rejects arbitrator", () =>
    send(bilateral.outsider, arbitrateReleaseIx(bilateral, bilateral.outsider, opened.milestoneHash, 100)), bilateral);
  console.log("PASS immutable arbitrator selection, release and refund, bilateral default");
}

await testRelease();
await testRefund();
await testReplacementAndDirectOpen();
await testToken2022Rejected();
await testCpiFailureRollsBack();
await testExtraVaultTokensExcluded();
await testArbitratorPolicy();
console.log("All on-chain validator tests passed");
