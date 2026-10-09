import "dotenv/config";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { execFileSync, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { Keypair, Transaction } from "@solana/web3.js";
import { getAccount, transfer } from "@solana/spl-token";
import { db } from "../lib/db";
import { releaseArgs, cliMain } from "./release-cli";
import { configuredRelease, releaseDigest } from "../lib/blockchain/release-manifest";
import { chainIdentity, contextAccounts, protocolInstruction } from "../lib/blockchain/chain-protocol";
import { chainRuntimeState } from "../lib/blockchain/chain-readiness";
import { readChainHistory } from "../lib/blockchain/chain-history";
import { baseChainContext } from "../lib/services/transactions/chain-sync";
import { createContract } from "../lib/services/contracts/create-contract";
import { claimContract } from "../lib/services/contracts/claim-contract";
import { acceptContractClaim } from "../lib/services/contracts/accept-contract-claim";
import { prepareChainOperation, recordSignedOperation, recoverChainOperation, recoverChainOperationAsOwner } from "../lib/services/transactions/chain-operations";
import { submitMilestoneProof } from "../lib/services/milestones/submit-milestone-proof";
import { approveMilestone } from "../lib/services/milestones/approve-milestone";
import { requestMilestoneRevision } from "../lib/services/milestones/request-milestone-revision";
import type { EscrowTransactionKind } from "@prisma/client";
import type { DevnetEvidence } from "../lib/blockchain/devnet-evidence";
import { assertState } from "../lib/services/errors";

cliMain(async () => {
  const args = releaseArgs(); if (args.manifest) process.env.ESCROW_RELEASE_MANIFEST_PATH = args.manifest;
  const release = configuredRelease(); assertState(release.manifest.cluster === "devnet", "Devnet approval required");
  const runtime = await chainRuntimeState(), identity = await chainIdentity();
  assertState(runtime.canPrepareFunds && runtime.canSettleDispute, "Approved release must be open for acceptance");
  assertState(execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim() === release.manifest.sourceCommit, "Candidate source commit differs");
  const budget = BigInt(process.env.DEVNET_ACCEPTANCE_BUDGET_UNITS || "0");
  assertState(budget >= 17100000n, "A principal budget of at least 17.1 test tokens including the donation fixture is required per run");
  const load = (name: string) => Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(process.env[name] || "", "utf8"))));
  if (!args.apply) return { status: "ready_for_authorized_run", releaseId: release.manifest.releaseId, testTokenBudgetUnits: "17100000", runMode: "service-keypair", realExtensionAcceptance: "pending" };
  // Explicit --apply, approved release, test wallets and budget; never deploy, mint, request airdrops or clear a database.
  const creator = load("DEVNET_CREATOR_KEYPAIR_PATH"), worker = load("DEVNET_WORKER_KEYPAIR_PATH"), arbitrator = load("DEVNET_ARBITRATOR_KEYPAIR_PATH");
  assertState(new Set([creator, worker, arbitrator].map((w) => w.publicKey.toBase58())).size === 3, "Acceptance roles must use different wallets");
  const runId = `${Date.now()}-${randomUUID()}`, path = `output/iteration-3/${runId}`; mkdirSync(path, { recursive: true });
  const report: DevnetEvidence = { schemaVersion: 1, runId, releaseId: release.manifest.releaseId, manifestSha256: release.manifestSha256, sourceCommit: release.manifest.sourceCommit,
    network: "devnet", startedAt: new Date().toISOString(), endedAt: null, execution: "service-keypair", cases: Array.from({ length: 24 }, (_, n) => ({ id: `D${String(n + 1).padStart(2, "0")}`, status: "pending", contractId: null, steps: [], finalLedger: null, reasonCode: "EXTERNAL_OR_FAULT_ACCEPTANCE_REQUIRED" })) };
  mkdirSync(`${path}/rpc`, { recursive: true });
  const save = () => writeFileSync(`${path}/evidence.json`, JSON.stringify(report, null, 2));
  let used = 0n;
  async function execute(c: DevnetEvidence["cases"][number], mid: string | undefined, kind: EscrowTransactionKind, actor: Keypair, extra: Record<string, string> = {}, broadcast = true, existing?: Awaited<ReturnType<typeof prepareChainOperation>>) {
    if (kind === "fund") { used += 1000000n; assertState(used <= budget, "Acceptance budget exceeded"); }
    const contextBefore = await baseChainContext(c.contractId!), bindingsBefore = contextAccounts(contextBefore);
    const balancesBefore = await identity.connection.getMultipleAccountsInfoAndContext([bindingsBefore.creatorTokenAccount, bindingsBefore.workerTokenAccount], { commitment: "finalized" });
    const tokenUnits = (data: Buffer | undefined) => data ? data.readBigUInt64LE(64) : 0n;
    const creatorBefore = tokenUnits(balancesBefore.value[0]?.data), workerBefore = tokenUnits(balancesBefore.value[1]?.data);
    const op = existing ?? await prepareChainOperation({ contractId: c.contractId!, milestoneId: mid, kind, walletAddress: actor.publicKey.toBase58(), idempotencyKey: randomUUID(), ...extra });
    assertState(!!op.transaction, "Prepared message unavailable"); const tx = Transaction.from(Buffer.from(op.transaction!, "base64")); tx.sign(actor);
    const signed = await recordSignedOperation({ transactionId: op.transactionId, walletAddress: actor.publicKey.toBase58(), signedTransaction: tx.serialize().toString("base64") });
    if (c.id === "D14" && kind === "fund") {
      await db.escrowTransaction.update({ where: { id: op.transactionId }, data: { requiresReviewAt: new Date(), reconciliationAttempts: 12, errorCode: "RECONCILIATION_RETRY_LIMIT", nextAttemptAt: null } });
      let refused = false;
      try { await recoverChainOperationAsOwner({ transactionId: op.transactionId, walletAddress: worker.publicKey.toBase58() }); } catch { refused = true; }
      assertState(refused, "Another wallet resumed the capped operation");
      await recoverChainOperationAsOwner({ transactionId: op.transactionId, walletAddress: actor.publicKey.toBase58() });
    }
    if (broadcast) await identity.connection.sendRawTransaction(tx.serialize(), { preflightCommitment: "finalized" });
    if (!broadcast && !existing) {
      await new Promise<void>((resolve, reject) => {
        const child = spawn("corepack", ["pnpm", "exec", "tsx", "scripts/recover-saved-chain-operation.ts", "--transaction", op.transactionId], { env: process.env, stdio: "ignore" });
        child.on("exit", (code) => code === 0 ? resolve() : reject(new Error("Independent recovery process failed"))); child.on("error", reject);
      });
    }
    let done = false;
    for (let n = 0; n < 150; n++) {
      const operation = await recoverChainOperation(op.transactionId);
      if (operation.status === "reconciled") { done = true; break; }
      if (operation.status === "failed" || operation.requiresReviewAt) throw new Error("Acceptance operation requires review");
      await new Promise((r) => setTimeout(r, 1500));
    }
    assertState(done, "Finalized recovery did not complete");
    const base = await baseChainContext(c.contractId!), contract = await db.contract.findUniqueOrThrow({ where: { id: c.contractId! }, include: { milestones: true } });
    const s = await readChainHistory(base, contract.milestones.map((m) => m.id));
    const e = s.instructions.find((e) => e.txSig === signed.txSig && e.kind === kind); assertState(!!e, "Finalized instruction missing");
    const vault = await getAccount(identity.connection, contextAccounts(base).vaultPda, "finalized"), O = s.funded - s.released - s.refunded;
    assertState(vault.amount === O + s.extra, "Vault differs from principal and donations");
    const balancesAfter = await identity.connection.getMultipleAccountsInfoAndContext([bindingsBefore.creatorTokenAccount, bindingsBefore.workerTokenAccount], { commitment: "finalized", minContextSlot: Number(s.slot) });
    const creatorAfter = tokenUnits(balancesAfter.value[0]?.data), workerAfter = tokenUnits(balancesAfter.value[1]?.data), amount = BigInt(e!.context.amount);
    const deltaCreator = kind === "fund" ? -amount : kind.endsWith("refund") ? amount : 0n;
    const deltaWorker = kind === "release" || kind.endsWith("release") ? amount : 0n;
    assertState(creatorAfter - creatorBefore === deltaCreator && workerAfter - workerBefore === deltaWorker, "Dedicated wallet balance window differs from principal CPI");
    const rawTransaction = await identity.connection.getTransaction(signed.txSig!, { commitment: "finalized", maxSupportedTransactionVersion: 0 });
    assertState(!!rawTransaction?.meta && !rawTransaction.meta.err, "Raw finalized transaction unavailable");
    const rpcEvidence = JSON.parse(JSON.stringify(rawTransaction));
    const accountEvidence = { before: balancesBefore, after: balancesAfter, vaultAddress: bindingsBefore.vaultPda.toBase58(), vaultUnits: vault.amount.toString(), finalizedHead: s.head, snapshotSlot: s.slot.toString() };
    writeFileSync(`${path}/rpc/${signed.txSig}.transaction.json`, JSON.stringify(rpcEvidence));
    writeFileSync(`${path}/rpc/${signed.txSig}.accounts.json`, JSON.stringify(accountEvidence));
    c.steps.push({ rpcEvidenceSha256: releaseDigest(rpcEvidence), accountEvidenceSha256: releaseDigest(JSON.parse(JSON.stringify(accountEvidence))), creatorBefore: creatorBefore.toString(), creatorAfter: creatorAfter.toString(), workerBefore: workerBefore.toString(), workerAfter: workerAfter.toString(), escrow: bindingsBefore.escrowPda.toBase58(), vault: bindingsBefore.vaultPda.toBase58(), mint: base.mint, transactionId: op.transactionId, txSig: signed.txSig!, slot: e!.slot.toString(), transactionIndex: e!.transactionIndex, instructionIndex: e!.instructionIndex, kind, evidenceHash: e!.evidenceHash,
      F: s.funded.toString(), R: s.released.toString(), Q: s.refunded.toString(), O: O.toString(), X: s.extra.toString(), vaultUnits: vault.amount.toString(), eventIds: (await db.event.findMany({ where: { contractId: c.contractId!, txSig: signed.txSig! }, select: { id: true } })).map((e) => e.id) });
    c.finalLedger = { F: s.funded.toString(), R: s.released.toString(), Q: s.refunded.toString(), O: O.toString() }; save(); return op;
  }
  async function approve(id: string, mid: string, revise = false) {
    await submitMilestoneProof({ contractId: id, milestoneId: mid, walletAddress: worker.publicKey.toBase58(), note: "Devnet acceptance proof" });
    if (revise) { await requestMilestoneRevision({ contractId: id, milestoneId: mid, walletAddress: creator.publicKey.toBase58(), note: "Acceptance revision" }); await submitMilestoneProof({ contractId: id, milestoneId: mid, walletAddress: worker.publicKey.toBase58(), note: "Revised acceptance proof" }); }
    await approveMilestone({ contractId: id, milestoneId: mid, walletAddress: creator.publicKey.toBase58() });
  }
  save();
  for (const id of ["D01", "D02", "D03", "D04", "D05", "D06", "D07", "D08", "D09", "D10", "D11", "D12", "D13", "D14", "D15", "D16", "D17"]) {
    const c = report.cases.find((c) => c.id === id)!;
    try {
      const arbitration = ["D05", "D06"].includes(id), publicClaim = id === "D02";
      const contract = await createContract({ creatorWallet: creator.publicKey.toBase58(), workerWallet: publicClaim ? undefined : worker.publicKey.toBase58(), isPublic: publicClaim,
        title: `${runId} ${id}`, totalAmount: "1", disputePolicy: arbitration ? "arbitrator" : "bilateral", arbitratorWallet: arbitration ? arbitrator.publicKey.toBase58() : undefined,
        milestones: id === "D16" ? Array.from({length:8}, (_, n) => ({ title: `Fixed ${n+1}`, amount: "0.125" })) : [{ title: "First", amount: "0.4" }, { title: "Second", amount: "0.6" }] }); c.contractId = contract.id; save();
      if (publicClaim) { await claimContract({ contractId: contract.id, walletAddress: worker.publicKey.toBase58() }); await acceptContractClaim({ contractId: contract.id, walletAddress: creator.publicKey.toBase58(), applicantWallet: worker.publicKey.toBase58() }); }
      if (id === "D10") {
        const expired = await prepareChainOperation({ contractId: contract.id, kind: "fund", walletAddress: creator.publicKey.toBase58(), idempotencyKey: randomUUID() });
        const saved = await db.escrowTransaction.findUniqueOrThrow({ where: { id: expired.transactionId } });
        while (BigInt(await identity.connection.getBlockHeight("finalized")) <= saved.lastValidBlockHeight!) await new Promise((r) => setTimeout(r, 2000));
        const result = await recoverChainOperation(saved.id);
        assertState(result.status === "failed" && result.contractLockKey === null && result.errorCode === "TRANSACTION_EXPIRED", "Unsigned expiry was not proven");
      }
      if (id === "D15") {
        const pins = ["ESCROW_NETWORK_GENESIS_HASH", "ESCROW_PROGRAM_SHA256", "NEXT_PUBLIC_USDC_MINT"];
        for (const pin of pins) {
          const original = process.env[pin]; process.env[pin] = pin === "ESCROW_PROGRAM_SHA256" ? "0".repeat(64) : Keypair.generate().publicKey.toBase58();
          let refused = false;
          try { await prepareChainOperation({ contractId: contract.id, kind: "fund", walletAddress: creator.publicKey.toBase58(), idempotencyKey: randomUUID() }); } catch { refused = true; }
          finally { process.env[pin] = original; }
          assertState(refused, "Changed release pin was accepted");
        }
      }
      if (id === "D17") {
        const prepared = await prepareChainOperation({ contractId: contract.id, kind: "fund", walletAddress: creator.publicKey.toBase58(), idempotencyKey: randomUUID() });
        process.env.ESCROW_CHAIN_NEW_OPERATIONS_ENABLED = "false";
        try {
          let refused = false;
          try { await prepareChainOperation({ contractId: contract.id, kind: "fund", walletAddress: creator.publicKey.toBase58(), idempotencyKey: randomUUID() }); } catch { refused = true; }
          assertState(refused, "New preparation remained enabled");
          await execute(c, undefined, "fund", creator, {}, false, prepared);
        } finally { process.env.ESCROW_CHAIN_NEW_OPERATIONS_ENABLED = "true"; }
      } else await execute(c, undefined, "fund", creator, {}, id !== "D08");
      const [first, second] = contract.milestones;
      if (id === "D12") {
        const base = await baseChainContext(contract.id), addresses = contextAccounts(base);
        used += 100000n; assertState(used <= budget, "Acceptance donation exceeds token budget");
        const sig = await transfer(identity.connection, creator, addresses.creatorTokenAccount, addresses.vaultPda, creator, 100000n);
        for (let n = 0; n < 100; n++) { const status = (await identity.connection.getSignatureStatuses([sig])).value[0]; if (status?.confirmationStatus === "finalized") break; await new Promise((r) => setTimeout(r, 1000)); }
      }
      if (id === "D16") {
        let refused = false; try { await prepareChainOperation({ contractId: contract.id, milestoneId: "unknown-milestone", kind: "release", walletAddress: creator.publicKey.toBase58(), idempotencyKey: randomUUID() }); } catch { refused = true; } assertState(refused, "Unknown milestone accepted");
        await approve(contract.id, first.id);
        const base = await baseChainContext(contract.id), partial = new Transaction({ feePayer: creator.publicKey, recentBlockhash: (await identity.connection.getLatestBlockhash("finalized")).blockhash }).add(protocolInstruction({ ...base, kind: "release", amount: "62500", milestoneId: first.id })); partial.sign(creator);
        assertState(!!(await identity.connection.simulateTransaction(partial)).value.err, "Partial fixed milestone accepted");
        for (const [n, milestone] of contract.milestones.entries()) { if (n > 0) await approve(contract.id, milestone.id); await execute(c, milestone.id, "release", creator); }
        assertState(c.finalLedger!.R === "1000000" && c.finalLedger!.O === "0", "Eight-milestone principal differs"); c.status = "pending"; c.reasonCode = "PDA_PREEMPTION_FAULT_CHECK_REQUIRED"; save(); continue;
      }

      if (id === "D13") {
        const before = await db.contract.findUniqueOrThrow({ where: { id: contract.id } });
        const previousRpc = process.env.SOLANA_SERVER_RPC_URL;
        process.env.SOLANA_SERVER_RPC_URL = "http://127.0.0.1:1";
        let refused = false;
        try { await prepareChainOperation({ contractId: contract.id, milestoneId: first.id, kind: "dispute_open", walletAddress: worker.publicKey.toBase58(), reason: "RPC fault", idempotencyKey: randomUUID() }); } catch { refused = true; }
        finally { if (previousRpc === undefined) delete process.env.SOLANA_SERVER_RPC_URL; else process.env.SOLANA_SERVER_RPC_URL = previousRpc; }
        assertState(refused, "Unavailable RPC was accepted");
        const after = await db.contract.findUniqueOrThrow({ where: { id: contract.id } }); assertState(before.fundedAmount.equals(after.fundedAmount) && before.releasedAmount.equals(after.releasedAmount), "RPC fault changed principal");
      }
      if (id === "D11") {
        const prepared = await prepareChainOperation({ contractId: contract.id, milestoneId: first.id, kind: "dispute_open", walletAddress: worker.publicKey.toBase58(), reason: "Concurrent operation", idempotencyKey: randomUUID() });
        let refused = false; try { await prepareChainOperation({ contractId: contract.id, milestoneId: first.id, kind: "release", walletAddress: creator.publicKey.toBase58(), idempotencyKey: randomUUID() }); } catch { refused = true; } assertState(refused, "Concurrent operation was admitted");
        await execute(c, first.id, "dispute_open", worker, { reason: "Concurrent operation" }, true, prepared);
        await execute(c, first.id, "dispute_propose", creator, { outcome: "release_to_worker", expectedProposalVersion: "0" });
        await execute(c, first.id, "dispute_accept_release", worker, { expectedProposalVersion: "1" });
      }

      if (["D03", "D05", "D07"].includes(id)) {
        await execute(c, first.id, "dispute_open", worker, { reason: "Acceptance dispute" });
        if (arbitration) await execute(c, first.id, "dispute_arbitrate_release", arbitrator);
        else {
          await execute(c, first.id, "dispute_propose", creator, { expectedProposalVersion: "0", outcome: "release_to_worker" });
          let version = "1";
          if (id === "D07") {
            await execute(c, first.id, "dispute_propose", creator, { expectedProposalVersion: "1", outcome: "release_to_worker" }); version = "2";
            let refused = false; try { await prepareChainOperation({ contractId: contract.id, milestoneId: first.id, kind: "dispute_accept_release", walletAddress: worker.publicKey.toBase58(), expectedProposalVersion: "1", idempotencyKey: randomUUID() }); } catch { refused = true; } assertState(refused, "Stale proposal accepted");
          }
          await execute(c, first.id, "dispute_accept_release", worker, { expectedProposalVersion: version });
        }
      } else if (id !== "D11") { await approve(contract.id, first.id, id === "D01"); await execute(c, first.id, "release", creator); }
      if (["D04", "D06", "D12"].includes(id)) {
        await execute(c, second.id, "dispute_open", worker, { reason: "Acceptance refund" });
        if (arbitration) await execute(c, second.id, "dispute_arbitrate_refund", arbitrator);
        else { await execute(c, second.id, "dispute_propose", creator, { expectedProposalVersion: "0", outcome: "refund_to_creator" }); await execute(c, second.id, "dispute_accept_refund", worker, { expectedProposalVersion: "1" }); }
        assertState(c.finalLedger!.R === "400000" && c.finalLedger!.Q === "600000", "Refund principal differs");
      } else { await approve(contract.id, second.id); const op = await execute(c, second.id, "release", creator); if (id === "D09") { const count = await db.chainAppliedInstruction.count({ where: { contractId: contract.id } }); await recoverChainOperation(op.transactionId); assertState(count === await db.chainAppliedInstruction.count({ where: { contractId: contract.id } }), "Duplicate projection"); } assertState(c.finalLedger!.R === "1000000" && c.finalLedger!.Q === "0", "Release principal differs"); }
      assertState(c.finalLedger!.O === "0", "Principal remains");
      c.status = ["D11", "D12", "D13", "D15"].includes(id) ? "pending" : "passed"; c.reasonCode = c.status === "passed" ? null : "COMPOUND_FAULT_OR_BROWSER_CHECKS_REQUIRED";
    } catch { c.status = "failed"; c.reasonCode = "ACCEPTANCE_ASSERTION_OR_DEPENDENCY_FAILED"; process.exitCode = 1; save(); break; }
    save();
  }
  report.endedAt = new Date().toISOString(); save();
  if (!process.exitCode) process.exitCode = 3;
  return { status: "incomplete", runId, evidencePath: `${path}/evidence.json`, usedTestTokenUnits: used.toString(), realExtensionStatus: "pending" };
});
