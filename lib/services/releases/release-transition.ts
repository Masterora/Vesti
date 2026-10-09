import { Prisma } from "@prisma/client";
import { PublicKey } from "@solana/web3.js";
import { db } from "@/lib/db";
import { chainIdentity, type ChainContext } from "@/lib/blockchain/chain-protocol";
import { readChainHistory, type ChainSnapshot } from "@/lib/blockchain/chain-history";
import { configuredRelease, releaseDigest, type ChainReleaseManifest } from "@/lib/blockchain/release-manifest";
import { configuredProtocolRegistry } from "@/lib/blockchain/protocol-version-registry";
import { decimalToTokenUnits, deriveEscrowPda, deriveLegacyEscrowPda } from "@/lib/blockchain/solana-escrow-accounts";
import { lockReleaseControl } from "./release-control";
import { lockContract } from "@/lib/services/contracts/contract-lock";
import { applyEvidence } from "@/lib/services/transactions/chain-sync";
import { assertFound, assertState } from "@/lib/services/errors";

const json = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
export function snapshotEvidence(s: ChainSnapshot) {
  return { genesisHash: s.identity.genesisHash, programId: s.identity.programId.toBase58(), mint: s.identity.mint.toBase58(), programHash: s.identity.programHash,
    head: s.head, baseline: s.baseline, slot: (s.instructions.at(-1)?.slot ?? 0n).toString(), extraTokenUnits: s.extra.toString(), funded: s.funded.toString(), released: s.released.toString(), refunded: s.refunded.toString(),
    status: s.status, receipts: [...s.receipts].map(([id, units]) => [id, units.toString()]), disputes: [...s.disputes].map(([id, dispute]) => [id, { ...dispute, version: dispute.version.toString(), amount: dispute.amount.toString(), settled: dispute.settled.toString() }]),
    instructions: s.instructions.map((e) => ({ txSig: e.txSig, instructionIndex: e.instructionIndex, evidenceHash: e.evidenceHash })) };
}
export async function prepareReleaseTransition(contractId: string, from: ChainReleaseManifest) {
  const release = configuredRelease(), registry = configuredProtocolRegistry();
  assertState(!!registry, "Approved historical registry is required");
  assertState(from.genesisHash === release.manifest.genesisHash && from.programId === release.manifest.programId && from.mint.address === release.manifest.mint.address, "Release transition cannot change chain or asset");
  assertState(registry!.versions.some((v) => v.manifestSha256 === releaseDigest(from) && v.programHash === from.deployedProgram.sha256 && v.descriptor.sourceCommit === from.sourceCommit && v.descriptor.artifactSha256 === from.artifact.sha256 && v.descriptorSha256 === from.protocolDescriptorSha256 && v.activationEvidenceSha256 === from.activationEvidenceSha256), "Historical release is missing");
  const targetVersion = registry!.versions.at(-1)!;
  assertState(targetVersion.manifestSha256 === release.manifestSha256 && targetVersion.descriptor.sourceCommit === release.manifest.sourceCommit && targetVersion.descriptor.artifactSha256 === release.manifest.artifact.sha256 && targetVersion.descriptorSha256 === release.manifest.protocolDescriptorSha256 && targetVersion.activationEvidenceSha256 === release.manifest.activationEvidenceSha256, "Target registry manifest differs");
  const control = await db.$transaction((tx) => lockReleaseControl(tx, "transition"));
  const contract = assertFound(await db.contract.findUnique({ where: { id: contractId }, include: { milestones: { orderBy: { index: "asc" } } } }), "Contract not found");
  assertState(!!contract.workerWallet, "Assigned Worker wallet is required");
  const pin = contract.chainBaselineEvidence as { programHash?: string; genesisHash?: string; programId?: string; mint?: string } | null;
  assertState(!pin || (pin.genesisHash === from.genesisHash && pin.programId === from.programId && (!pin.mint || pin.mint === from.mint.address) && [from.deployedProgram.sha256, release.manifest.deployedProgram.sha256].includes(pin.programHash || "")), "Baseline is not in the approved release chain");
  const identity = await chainIdentity();
  const legacy = deriveLegacyEscrowPda(contractId, identity.programId).address.toBase58();
  const current = deriveEscrowPda(contractId, identity.programId, new PublicKey(contract.creatorWallet)).address.toBase58();
  assertState(!contract.escrowAccount || [legacy, current].includes(contract.escrowAccount), "Escrow address changed");
  const context: ChainContext = { contractId, creator: contract.creatorWallet, worker: contract.workerWallet!, actor: contract.creatorWallet,
    policy: contract.disputePolicy, arbitrator: contract.arbitratorWallet, kind: "fund", amount: decimalToTokenUnits(contract.totalAmount).toString(), version: "0",
    programId: identity.programId.toBase58(), mint: identity.mint.toBase58(), genesisHash: identity.genesisHash, programHash: identity.programHash,
    addressScheme: contract.escrowAccount === legacy ? "legacy" : "creator", milestones: contract.milestones.map((m) => ({ id: m.id, amountUnits: decimalToTokenUnits(m.amount).toString() })),
    funded: decimalToTokenUnits(contract.fundedAmount).toString(), released: decimalToTokenUnits(contract.releasedAmount).toString(), refunded: decimalToTokenUnits(contract.refundedAmount).toString() };
  const snapshot = await readChainHistory(context, contract.milestones.map((m) => m.id));
  const candidate = { contractId, fromReleaseId: from.releaseId, toReleaseId: release.manifest.releaseId, fromManifestSha256: releaseDigest(from), toManifestSha256: release.manifestSha256,
    registrySha256: releaseDigest(registry), epoch: control.epoch.toString(), businessRevision: contract.businessRevision.toString(), beforeEvidence: contract.chainBaselineEvidence,
    afterEvidence: snapshotEvidence(snapshot) };
  return { candidate, approvalSha256: releaseDigest(candidate), snapshot };
}
export async function applyReleaseTransition(input: { contractId: string; from: ChainReleaseManifest; approvalSha256: string; actor: string; batchId?: string }) {
  // Exact retries return the immutable audit rather than reapproving new chain evidence.
  const key = { contractId: input.contractId, fromReleaseId: input.from.releaseId, toReleaseId: configuredRelease().manifest.releaseId };
  const previous = await db.chainReleaseTransition.findUnique({ where: { contractId_fromReleaseId_toReleaseId: key } });
  if (previous && !input.batchId) { assertState(previous.approvalSha256 === input.approvalSha256, "Different approval digest cannot retry a transition"); return previous; }
  if (previous && input.batchId) {
    const batch = await db.chainReleaseTransitionBatch.findUnique({ where: { transitionId_batchId: { transitionId: previous.id, batchId: input.batchId } } });
    if (batch) { assertState(batch.approvalSha256 === input.approvalSha256, "Different approval digest cannot retry a batch"); return batch; }
  }
  assertState(!input.batchId || !!previous, "Incremental batch requires a parent transition");
  const prepared = await prepareReleaseTransition(input.contractId, input.from);
  assertState(prepared.approvalSha256 === input.approvalSha256, "Chain or DB evidence changed; approve a new candidate");
  // Re-fetch immediately before the transaction; a later chain change requires another approved batch.
  const rechecked = await prepareReleaseTransition(input.contractId, input.from);
  assertState(rechecked.approvalSha256 === prepared.approvalSha256, "Chain evidence changed during transition");
  return db.$transaction(async (tx) => {
    await lockReleaseControl(tx, "transition", BigInt(prepared.candidate.epoch));
    // Serialize coordinators within this transaction before taking the contract lock.
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(741381, 3)::text AS locked`;
    const contract = await lockContract(tx, input.contractId, false, "transition", BigInt(prepared.candidate.epoch));
    assertState(contract.businessRevision.toString() === prepared.candidate.businessRevision && releaseDigest(contract.chainBaselineEvidence) === releaseDigest(prepared.candidate.beforeEvidence), "Contract changed during transition");
    assertState(await tx.escrowTransaction.count({ where: { contractId: contract.id, OR: [{ status: { in: ["building", "prepared", "signed", "submitted", "confirmed"] } }, { contractLockKey: { not: null } }, { requiresReviewAt: { not: null } }, { reconciliationLeaseExpiresAt: { gt: new Date() } }] } }) === 0, "Pending operation blocks transition");
    const s = prepared.snapshot;
    for (const e of s.instructions) {
      const instructionKey = { networkGenesisHash: s.identity.genesisHash, programId: s.identity.programId.toBase58(), txSig: e.txSig, instructionIndex: e.instructionIndex };
      const existing = await tx.chainAppliedInstruction.findUnique({ where: { networkGenesisHash_programId_txSig_instructionIndex: instructionKey } });
      if (existing) { assertState(existing.evidenceHash === e.evidenceHash, "Historical evidence changed"); continue; }
      await applyEvidence(tx, e);
      await tx.chainAppliedInstruction.create({ data: { ...instructionKey, contractId: contract.id, slot: e.slot, transactionIndex: e.transactionIndex, kind: e.kind, parameters: json(e.context), evidenceHash: e.evidenceHash } });
    }
    const current = await tx.contract.findUniqueOrThrow({ where: { id: contract.id } });
    assertState(decimalToTokenUnits(current.fundedAmount) === s.funded && decimalToTokenUnits(current.releasedAmount) === s.released && decimalToTokenUnits(current.refundedAmount) === s.refunded, "Transition ledger differs from complete replay");
    const last = s.instructions.at(-1);
    await tx.contract.update({ where: { id: contract.id }, data: { chainSyncStatus: "synced", chainReviewAt: null, chainReviewCode: null, chainReviewEvidence: Prisma.DbNull, chainBaselineKind: s.baseline,
      chainBaselineEvidence: json(prepared.candidate.afterEvidence), chainLastSyncedSlot: s.slot, chainLastSyncedTransactionIndex: last?.transactionIndex, chainLastSyncedInstructionIndex: last?.instructionIndex, businessRevision: { increment: 1 } } });
    const audit = { approvalSha256: input.approvalSha256, beforeEvidence: prepared.candidate.beforeEvidence === null ? Prisma.JsonNull : json(prepared.candidate.beforeEvidence), afterEvidence: json(prepared.candidate.afterEvidence), actor: input.actor };
    if (input.batchId) return tx.chainReleaseTransitionBatch.create({ data: { ...audit, transitionId: previous!.id, batchId: input.batchId } });
    return tx.chainReleaseTransition.create({ data: { ...audit, ...key, epoch: BigInt(prepared.candidate.epoch), fromManifestSha256: prepared.candidate.fromManifestSha256, toManifestSha256: prepared.candidate.toManifestSha256 } });
  }, { timeout: 20000 });
}
