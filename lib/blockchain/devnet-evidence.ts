import { readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { db } from "@/lib/db";
import { chainIdentity, contextAccounts } from "./chain-protocol";
import { baseChainContext } from "@/lib/services/transactions/chain-sync";
import { readChainHistory } from "./chain-history";
import { configuredRelease, releaseDigest } from "./release-manifest";
import { assertState } from "@/lib/services/errors";
import { decimalToTokenUnits } from "./solana-escrow-accounts";
const units = z.string().regex(/^\d+$/);
export const devnetEvidenceSchema = z.object({
  schemaVersion: z.literal(1), runId: z.string(), releaseId: z.string(), manifestSha256: z.string(), sourceCommit: z.string(),
  network: z.literal("devnet"), startedAt: z.string(), endedAt: z.string().nullable(), execution: z.literal("service-keypair"),
  cases: z.array(z.object({ id: z.string(), status: z.enum(["passed", "failed", "blocked", "pending"]), contractId: z.string().nullable(),
    steps: z.array(z.object({ transactionId: z.string(), txSig: z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{64,88}$/), slot: units, transactionIndex: z.number().int(), instructionIndex: z.number().int(), kind: z.string(), evidenceHash: z.string(), rpcEvidenceSha256: z.string(), accountEvidenceSha256: z.string(), creatorBefore: units, creatorAfter: units, workerBefore: units, workerAfter: units, escrow: z.string(), vault: z.string(), mint: z.string(), F: units, R: units, Q: units, O: units, X: units, vaultUnits: units, eventIds: z.array(z.string()) }).strict()),
    finalLedger: z.object({ F: units, R: units, Q: units, O: units }).strict().nullable(), reasonCode: z.string().nullable() }).strict()),
}).strict();
export type DevnetEvidence = z.infer<typeof devnetEvidenceSchema>;
export async function verifyDevnetEvidence(raw: unknown, rawEvidenceDirectory: string) {
  const evidence = devnetEvidenceSchema.parse(raw), release = configuredRelease();
  assertState(release.manifest.cluster === "devnet" && evidence.releaseId === release.manifest.releaseId && evidence.manifestSha256 === release.manifestSha256 && evidence.sourceCommit === release.manifest.sourceCommit, "Evidence release differs");
  await chainIdentity();
  assertState(new Set(evidence.cases.map((c) => c.id)).size === evidence.cases.length, "Duplicate acceptance case identifiers");
  const missing = Array.from({ length: 24 }, (_, n) => `D${String(n + 1).padStart(2, "0")}`).filter((id) => !evidence.cases.some((c) => c.id === id && c.status === "passed"));
  const verified = [];
  for (const c of evidence.cases.filter((c) => c.status === "passed")) {
    assertState(!!c.contractId && c.steps.length > 0 && !!c.finalLedger, "Passed service case has no actual financial evidence");
    const contract = await db.contract.findUniqueOrThrow({ where: { id: c.contractId! }, include: { milestones: true } });
    const base = await baseChainContext(contract.id), snapshot = await readChainHistory(base, contract.milestones.map((m) => m.id));
    for (const step of c.steps) {
      const rawTransaction = JSON.parse(readFileSync(join(rawEvidenceDirectory, `${step.txSig}.transaction.json`), "utf8"));
      const rawAccounts = JSON.parse(readFileSync(join(rawEvidenceDirectory, `${step.txSig}.accounts.json`), "utf8"));
      assertState(releaseDigest(rawTransaction) === step.rpcEvidenceSha256 && releaseDigest(rawAccounts) === step.accountEvidenceSha256, "Raw RPC evidence digest differs");
      const confirmed = await snapshot.identity.connection.getTransaction(step.txSig, { commitment: "finalized", maxSupportedTransactionVersion: 0 });
      assertState(!!confirmed?.meta && !confirmed.meta.err && releaseDigest(JSON.parse(JSON.stringify(confirmed))) === step.rpcEvidenceSha256, "Raw finalized transaction differs");
      const bindings = contextAccounts(base);
      assertState(step.escrow === bindings.escrowPda.toBase58() && step.vault === bindings.vaultPda.toBase58() && step.mint === base.mint, "Evidence account bindings differ");
      assertState(rawAccounts.vaultAddress === step.vault && rawAccounts.vaultUnits === step.vaultUnits && BigInt(rawAccounts.after.context.slot) >= BigInt(step.slot), "Raw account window differs");
      const message = confirmed!.transaction.message;
      const keys = [...message.staticAccountKeys, ...(confirmed!.meta!.loadedAddresses?.writable ?? []), ...(confirmed!.meta!.loadedAddresses?.readonly ?? [])];
      for (const [address, before, after] of [[bindings.creatorTokenAccount, step.creatorBefore, step.creatorAfter], [bindings.workerTokenAccount, step.workerBefore, step.workerAfter], [bindings.vaultPda, null, step.vaultUnits]] as const) {
        const index = keys.findIndex((key) => key.equals(address));
        const prior = confirmed!.meta!.preTokenBalances?.find((balance) => balance.accountIndex === index && balance.mint === base.mint);
        const next = confirmed!.meta!.postTokenBalances?.find((balance) => balance.accountIndex === index && balance.mint === base.mint);
        // An untouched participant ATA is absent from this transaction; its window is checked by the CPI delta below.
        if (index >= 0) assertState((before === null || (prior?.uiTokenAmount.amount ?? "0") === before) && (next?.uiTokenAmount.amount ?? "0") === after, "Participant or vault balance differs from finalized transaction metadata");
      }
      const proof = snapshot.instructions.find((i) => i.txSig === step.txSig && i.instructionIndex === step.instructionIndex && i.kind === step.kind);
      assertState(!!proof && proof.evidenceHash === step.evidenceHash && proof.slot.toString() === step.slot && proof.transactionIndex === step.transactionIndex, "Finalized instruction evidence differs");
      let F = 0n, R = 0n, Q = 0n;
      for (const instruction of snapshot.instructions) {
        if (instruction.kind === "fund") F += BigInt(instruction.context.amount);
        else if (instruction.kind === "release" || instruction.kind.endsWith("_release")) R += BigInt(instruction.context.amount);
        else if (instruction.kind.endsWith("_refund")) Q += BigInt(instruction.context.amount);
        if (instruction === proof) break;
      }
      assertState(F.toString() === step.F && R.toString() === step.R && Q.toString() === step.Q, "Step principal differs from chronological replay");
      const applied = await db.chainAppliedInstruction.findUniqueOrThrow({ where: { networkGenesisHash_programId_txSig_instructionIndex: { networkGenesisHash: base.genesisHash, programId: base.programId, txSig: step.txSig, instructionIndex: step.instructionIndex } } });
      assertState(applied.contractId === contract.id && applied.evidenceHash === step.evidenceHash, "DB instruction projection differs");
      assertState(BigInt(step.O) === BigInt(step.F) - BigInt(step.R) - BigInt(step.Q) && BigInt(step.vaultUnits) === BigInt(step.O) + BigInt(step.X), "Principal evidence is inconsistent");
      assertState(await db.event.count({ where: { id: { in: step.eventIds }, contractId: contract.id, txSig: step.txSig } }) === step.eventIds.length, "Event evidence differs");
      const amount = BigInt(proof!.context.amount), creatorDelta = step.kind === "fund" ? -amount : step.kind.endsWith("refund") ? amount : 0n, workerDelta = step.kind === "release" || step.kind.endsWith("release") ? amount : 0n;
      assertState(BigInt(step.creatorAfter) - BigInt(step.creatorBefore) === creatorDelta && BigInt(step.workerAfter) - BigInt(step.workerBefore) === workerDelta, "Participant balance evidence differs from verified CPI");
      const operation = await db.escrowTransaction.findUniqueOrThrow({ where: { id: step.transactionId } });
      assertState(operation.txSig === step.txSig && operation.status === "reconciled" && operation.contractId === contract.id, "DB operation evidence differs");
    }
    assertState(!!c.finalLedger && BigInt(c.finalLedger.F) === snapshot.funded && BigInt(c.finalLedger.R) === snapshot.released && BigInt(c.finalLedger.Q) === snapshot.refunded && BigInt(c.finalLedger.O) === snapshot.funded - snapshot.released - snapshot.refunded, "Final principal differs");
    assertState(decimalToTokenUnits(contract.fundedAmount) === snapshot.funded && decimalToTokenUnits(contract.releasedAmount) === snapshot.released && decimalToTokenUnits(contract.refundedAmount) === snapshot.refunded, "DB principal differs");
    verified.push(c.id);
  }
  // Financial reconciliation alone cannot attest all fault scenarios or extension use.
  return { status: "incomplete", financialEvidenceComplete: missing.length === 0, runId: evidence.runId, evidenceSha256: releaseDigest(evidence), verified, missing, realExtensionStatus: "pending" };
}
