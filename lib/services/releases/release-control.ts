import { baseChainContext } from "@/lib/services/transactions/chain-sync";
import { readChainHistory } from "@/lib/blockchain/chain-history";
import { decimalToTokenUnits } from "@/lib/blockchain/solana-escrow-accounts";
import { verifyMaintenanceApproval } from "./release-approval";
import { chainIdentity } from "@/lib/blockchain/chain-protocol";
import { Prisma, type ChainReleaseControl } from "@prisma/client";
import { db } from "@/lib/db";
import { configuredRelease, releaseDigest } from "@/lib/blockchain/release-manifest";
import { approveReleaseCandidate, candidateFromManifest } from "@/lib/blockchain/release-candidate";
import { verifyReleaseArtifact } from "@/lib/blockchain/release-verification";
import { ServiceError, assertState } from "@/lib/services/errors";

export const releasePhases = ["open", "draining", "frozen", "deploying", "rebinding"] as const;
export type ReleasePhase = typeof releasePhases[number];
export type ReleaseIntent = "prepare" | "business" | "recover" | "transition" | "status";
export function assertReleasePermission(control: ChainReleaseControl | null, intent: ReleaseIntent, manifestSha256: string, expectedEpoch?: bigint) {
  if (!control || (intent === "transition" || (intent === "status" && control.phase === "rebinding") ? control.targetManifestSha256 : control.activeManifestSha256) !== manifestSha256)
    throw new ServiceError("Chain release configuration is invalid", 503, "CHAIN_CONFIG_INVALID");
  const allowed = intent === "status" ? true : intent === "transition" ? control.phase === "rebinding" : intent === "recover" ? ["open", "draining"].includes(control.phase) : control.phase === "open" && process.env.ESCROW_CHAIN_NEW_OPERATIONS_ENABLED === "true";
  if (!allowed || (expectedEpoch !== undefined && control.epoch !== expectedEpoch))
    throw new ServiceError("New operations are paused; check the original transaction status", 503, "NEW_OPERATIONS_PAUSED");
  return control;
}
export async function lockReleaseControl(tx: Prisma.TransactionClient, intent: ReleaseIntent, expectedEpoch?: bigint) {
  const release = configuredRelease();
  await tx.$queryRaw`SELECT "environmentKey" FROM "ChainReleaseControl" WHERE "environmentKey" = ${release.environmentKey} FOR SHARE`;
  const control = await tx.chainReleaseControl.findUnique({ where: { environmentKey: release.environmentKey } });
  return assertReleasePermission(control, intent, release.manifestSha256, expectedEpoch);
}
export async function currentReleaseControl() {
  const release = configuredRelease();
  return db.chainReleaseControl.findUnique({ where: { environmentKey: release.environmentKey } });
}
export async function assertRecoveryEnabled() {
  return db.$transaction((tx) => lockReleaseControl(tx, "recover"));
}
// This function is only called by the maintenance CLI, never a Web route.
export async function changeReleasePhase(input: { expectedPhase: ReleasePhase; expectedEpoch: bigint; nextPhase: ReleasePhase; actor: string; batch: string; targetManifestSha256?: string; evidence?: Prisma.InputJsonValue; approvalSha256?: string; candidate?: unknown; candidateApprovalSha256?: string; artifactPath?: string; idlPath?: string }) {
  const release = configuredRelease();
  const verification = ["frozen", "deploying", "open"].includes(input.nextPhase) ? await verifyMaintenanceApproval(input.evidence, input.approvalSha256 || "") : null;
  const candidate = input.nextPhase === "deploying" ? approveReleaseCandidate(input.candidate, input.candidateApprovalSha256 || "", release.manifest) : null;
  let receipt: Awaited<ReturnType<typeof verifyReleaseArtifact>> | null = null;
  if (input.nextPhase === "rebinding") {
    assertState(input.targetManifestSha256 === release.manifestSha256, "Final deployment manifest requires exact approval");
    assertState(!!input.artifactPath && !!input.idlPath, "Locked artifact and IDL are required to bind a deployment receipt");
    receipt = await verifyReleaseArtifact(input.artifactPath!, input.idlPath!);
  } else assertState(!input.targetManifestSha256, "Final target is bound only after deployment");
  if (["open", "rebinding"].includes(input.nextPhase)) await chainIdentity();
  if (input.nextPhase === "open") {
    const contracts = await db.contract.findMany({ where: { workerWallet: { not: null } }, include: { milestones: true } });
    for (const contract of contracts) {
      const snapshot = await readChainHistory(await baseChainContext(contract.id), contract.milestones.map((m) => m.id));
      const pin = contract.chainBaselineEvidence as { head?: string | null; extraTokenUnits?: string } | null;
      assertState(snapshot.funded === decimalToTokenUnits(contract.fundedAmount) && snapshot.released === decimalToTokenUnits(contract.releasedAmount) && snapshot.refunded === decimalToTokenUnits(contract.refundedAmount) && snapshot.head === (pin?.head ?? null) && snapshot.extra.toString() === (pin?.extraTokenUnits ?? "0"), "New chain evidence requires an approved conversion batch before open");
    }
  }
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "environmentKey" FROM "ChainReleaseControl" WHERE "environmentKey" = ${release.environmentKey} FOR UPDATE`;
    const current = await tx.chainReleaseControl.findUniqueOrThrow({ where: { environmentKey: release.environmentKey } });
    if (current.phase === "deploying") {
      const finalCandidate = candidateFromManifest(release.manifest);
      assertState(!!current.deploymentCandidateSha256 && releaseDigest(finalCandidate) === current.deploymentCandidateSha256 &&
        releaseDigest(current.deploymentCandidateEvidence) === current.deploymentCandidateSha256 &&
        release.manifest.predecessorManifestSha256 === current.activeManifestSha256, "Deployment receipt differs from approved candidate");
    } else assertState(current.phase === "rebinding" ? current.targetManifestSha256 === release.manifestSha256 : current.activeManifestSha256 === release.manifestSha256, "Maintenance manifest differs");
    assertState(current.phase === input.expectedPhase && current.epoch === input.expectedEpoch, "Maintenance phase or epoch changed");
    assertState(releasePhases[(releasePhases.indexOf(input.expectedPhase) + 1) % releasePhases.length] === input.nextPhase, "Invalid maintenance transition");
    if (input.nextPhase === "draining") {
      assertState(current.activeManifestSha256 === release.manifestSha256, "Active release differs");
      // Only building has never published a message. prepared is NEVER cancelled here.
      await tx.escrowTransaction.updateMany({ where: { mode: "onchain", status: "building" }, data: { status: "failed", contractLockKey: null, buildToken: null, errorCode: "MAINTENANCE_BUILD_CANCELLED", errorMessage: "Preparation stopped for maintenance" } });
    }
    if (verification) {
      assertState(verification.approval.activationEvidenceSha256 === release.manifest.activationEvidenceSha256, "Activation evidence differs");
      const contracts = await tx.contract.findMany({ select: { id: true, escrowAccount: true, businessRevision: true, chainBaselineEvidence: true } });
      assertState(JSON.stringify(contracts.map((c) => ({ ...c, businessRevision: c.businessRevision.toString() })).sort((a,b) => a.id.localeCompare(b.id))) === JSON.stringify([...verification.inventory.contracts].sort((a,b) => a.id.localeCompare(b.id))), "DB inventory changed during maintenance transition");
    }
    if (["frozen", "deploying", "open"].includes(input.nextPhase)) {
      const pending = await tx.escrowTransaction.count({ where: { mode: "onchain", OR: [{ status: { in: ["building", "prepared", "signed", "submitted", "confirmed"] } }, { contractLockKey: { not: null } }, { requiresReviewAt: { not: null } }, { reconciliationLeaseExpiresAt: { gt: new Date() } }] } });
      assertState(pending === 0, "Pending transactions, locks, leases or review block release");
      assertState(await tx.contract.count({ where: { chainSyncStatus: { in: ["review", "degraded"] } } }) === 0, "Contract review blocks release");
      assertState(!!input.evidence, "Approved complete inventory and drain evidence are required");
    }
    if (input.nextPhase === "open") {
      assertState(current.targetManifestSha256 === release.manifestSha256, "Target release differs");
      const bound = await tx.contract.findMany({ where: { chainBaselineEvidence: { not: Prisma.DbNull } }, select: { chainBaselineEvidence: true } });
      assertState(bound.every((c) => { const pin = c.chainBaselineEvidence as { programHash?: string }; return pin.programHash === release.manifest.deployedProgram.sha256; }), "Contracts still require release conversion");
    }
    return tx.chainReleaseControl.update({ where: { environmentKey: release.environmentKey }, data: { phase: input.nextPhase, epoch: { increment: 1 }, actor: input.actor, maintenanceBatch: input.batch,
      ...(input.targetManifestSha256 ? { targetManifestSha256: input.targetManifestSha256 } : {}),
      ...(candidate ? { deploymentCandidateSha256: releaseDigest(candidate), deploymentCandidateEvidence: candidate, targetManifestSha256: null, deploymentReceiptEvidence: Prisma.DbNull } : {}),
      ...(receipt ? { deploymentReceiptEvidence: receipt } : {}),
      ...(input.nextPhase === "open" ? { activeManifestSha256: release.manifestSha256, targetManifestSha256: null } : {}),
      ...(input.evidence ? { drainEvidence: input.evidence } : {}),
    } });
  }, { timeout: 20000 });
}
