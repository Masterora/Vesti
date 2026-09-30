import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { decimalToTokenUnits, deriveLegacyEscrowPda, deriveEscrowPda } from "@/lib/blockchain/solana-escrow-accounts";
import { PublicKey } from "@solana/web3.js";
import {
  ChainReviewError,
  chainIdentity,
  contextAccounts,
  disputeAddress,
  type ChainContext,
} from "@/lib/blockchain/chain-protocol";
import {
  readChainHistory,
  type ChainInstructionEvidence,
  type ChainSnapshot,
} from "@/lib/blockchain/chain-history";
import { lockContract } from "@/lib/services/contracts/contract-lock";
import { applyContractFunded } from "@/lib/services/contracts/apply-contract-funded";
import { applyMilestoneRelease } from "@/lib/services/milestones/apply-milestone-release";
import { recordEvent } from "@/lib/services/events/record-event";
import { assertAllowed, assertFound, assertState, ServiceError } from "@/lib/services/errors";

export async function baseChainContext(
  contractId: string,
): Promise<ChainContext> {
  const contract = assertFound(
    await db.contract.findUnique({ where: { id: contractId }, include: { milestones: { orderBy: { index: "asc" } } } }),
    "Contract not found",
  );
  assertState(
    Boolean(contract.workerWallet),
    "Assigned Worker wallet is required",
  );
  const identity = await chainIdentity();
  const currentAddress = deriveEscrowPda(contractId, identity.programId, new PublicKey(contract.creatorWallet)).address.toBase58();
  const legacyAddress = deriveLegacyEscrowPda(contractId, identity.programId).address.toBase58();
  if (contract.escrowAccount && ![currentAddress, legacyAddress].includes(contract.escrowAccount))
    throw new ChainReviewError("ESCROW_ADDRESS_CHANGED");
  if (contract.escrowAccount !== legacyAddress && contract.milestones.length > 8)
    throw new ServiceError("On-chain contracts support up to 8 fixed milestones", 409);
  const pinned = contract.chainBaselineEvidence as { genesisHash?: string; programId?: string; mint?: string; programHash?: string } | null;
  if (pinned && (pinned.genesisHash !== identity.genesisHash ||
      pinned.programId !== identity.programId.toBase58() ||
      (pinned.mint && pinned.mint !== identity.mint.toBase58()) ||
      (pinned.programHash && pinned.programHash !== identity.programHash)))
    throw new ChainReviewError("CHAIN_IDENTITY_CHANGED");
  return {
    contractId,
    milestones: contract.milestones.map((m) => ({ id: m.id, amountUnits: decimalToTokenUnits(m.amount).toString() })),
    addressScheme: contract.escrowAccount === deriveLegacyEscrowPda(contractId, identity.programId).address.toBase58()
      ? "legacy" : "creator",
    creator: contract.creatorWallet,
    worker: contract.workerWallet!,
    actor: contract.creatorWallet,
    policy: contract.disputePolicy,
    arbitrator: contract.arbitratorWallet,
    programId: identity.programId.toBase58(),
    mint: identity.mint.toBase58(),
    genesisHash: identity.genesisHash,
    programHash: identity.programHash,
    kind: "fund",
    amount: decimalToTokenUnits(contract.totalAmount).toString(),
    version: "0",
    funded: decimalToTokenUnits(contract.fundedAmount).toString(),
    released: decimalToTokenUnits(contract.releasedAmount).toString(),
    refunded: decimalToTokenUnits(contract.refundedAmount).toString(),
  };
}
export async function markChainProblem(contractId: string, error: unknown) {
  await db.$transaction(async (tx) => {
    const contract = await lockContract(tx, contractId);
    const review = error instanceof ChainReviewError;
    await tx.contract.update({
      where: { id: contractId },
      data: {
        chainSyncStatus:
          review || contract.chainSyncStatus === "review"
            ? "review"
            : "degraded",
        ...(review
          ? {
              chainReviewAt: new Date(),
              chainReviewCode: error.code,
              chainReviewEvidence: error.evidence,
            }
          : {}),
        businessRevision: { increment: 1 },
      },
    });
  });
}
async function applyEvidence(
  tx: Prisma.TransactionClient,
  e: ChainInstructionEvidence,
) {
  const c = e.context;
  const contract = await tx.contract.findUniqueOrThrow({
    where: { id: c.contractId },
    include: { milestones: { orderBy: { index: "asc" } } },
  });
  if (e.kind.startsWith("initialize_escrow")) {
    await tx.contract.update({
      where: { id: contract.id },
      data: { escrowAccount: contextAccounts(c).escrowPda.toBase58() },
    });
    return;
  }
  if (e.kind === "fund") {
    if (contract.fundedAmount.isZero()) {
      if (contract.status !== "draft")
        throw new ChainReviewError("INVALID_LOCAL_FUNDING_STATE", {
          txSig: e.txSig,
        });
      await applyContractFunded(tx, {
        contract,
        actorWallet: c.actor,
        escrowAccount: contextAccounts(c).escrowPda.toBase58(),
        txSig: e.txSig,
      });
    } else if (
      decimalToTokenUnits(contract.fundedAmount).toString() !== c.amount
    )
      throw new ChainReviewError("LOCAL_FUNDING_MISMATCH");
    return;
  }
  const milestone = assertFound(
    contract.milestones.find((m) => m.id === c.milestoneId),
    "Milestone not found",
  );
  if (e.kind === "dispute_open") {
    const existing = await tx.dispute.findUnique({
      where: { milestoneId: milestone.id },
    });
    if (existing) {
      if (existing.openedBy !== c.actor || existing.status === "resolved")
        throw new ChainReviewError("LOCAL_DISPUTE_MISMATCH", {
          txSig: e.txSig,
        });
      await tx.dispute.update({
        where: { id: existing.id },
        data: {
          chainAddress: disputeAddress(c).toBase58(),
          milestoneHash: digestMilestone(milestone.id),
          reasonHash: c.reasonHash,
        },
      });
      return;
    }
    if (
      contract.status !== "active" ||
      !["ready", "submitted", "revision_requested", "approved"].includes(
        milestone.status,
      )
    )
      throw new ChainReviewError("INVALID_LOCAL_DISPUTE_STATE", {
        txSig: e.txSig,
      });
    const web = await tx.escrowTransaction.findUnique({
      where: { txSig: e.txSig },
    });
    const webContext = web?.operationContext as ChainContext | null;
    await tx.dispute.create({
      data: {
        contractId: contract.id,
        milestoneId: milestone.id,
        openedBy: c.actor,
        reason: webContext?.reason ?? null,
        source: web ? "web" : "chain",
        previousMilestoneStatus: milestone.status,
        chainAddress: disputeAddress(c).toBase58(),
        milestoneHash: digestMilestone(milestone.id),
        reasonHash: c.reasonHash,
      },
    });
    await tx.milestone.update({
      where: { id: milestone.id },
      data: { status: "disputed" },
    });
    await tx.contract.update({
      where: { id: contract.id },
      data: { status: "disputed" },
    });
    await recordEvent(tx, {
      contractId: contract.id,
      milestoneId: milestone.id,
      actorWallet: c.actor,
      eventType: "contract_disputed",
      txSig: e.txSig,
      payload: { title: milestone.title, reason: webContext?.reason ?? null },
    });
    return;
  }
  const dispute = await tx.dispute.findUnique({
    where: { milestoneId: milestone.id },
  });
  if (e.kind === "dispute_propose") {
    if (
      c.outcome === "release_to_worker" &&
      decimalToTokenUnits(milestone.amount).toString() !== c.amount
    )
      throw new ChainReviewError("UNSUPPORTED_PARTIAL_PROPOSAL", {
        txSig: e.txSig,
        observedAmountUnits: c.amount,
      });
    if (!dispute || dispute.status === "resolved")
      throw new ChainReviewError("LOCAL_DISPUTE_MISMATCH");
    await tx.dispute.update({
      where: { id: dispute.id },
      data: {
        status: "proposed",
        proposedOutcome: c.outcome,
        proposedBy: c.actor,
        proposalVersion: BigInt(c.version) + BigInt(1),
        proposedAmountUnits: c.outcome === "refund_to_creator" ? "0" : c.amount,
      },
    });
    await recordEvent(tx, {
      contractId: contract.id,
      milestoneId: milestone.id,
      actorWallet: c.actor,
      eventType: "dispute_resolution_proposed",
      txSig: e.txSig,
      payload: {
        outcome: c.outcome!,
        proposalVersion: (BigInt(c.version) + BigInt(1)).toString(),
      },
    });
    return;
  }
  const release = e.kind === "release" || e.kind.endsWith("release");
  if (release && decimalToTokenUnits(milestone.amount).toString() !== c.amount)
    throw new ChainReviewError("UNSUPPORTED_PARTIAL_RELEASE", {
      txSig: e.txSig,
      observedAmountUnits: c.amount,
    });
  if (e.kind === "release") {
    // Legacy already-projected records are checked by the final ledger comparison.
    if (milestone.status !== "released") {
      if (contract.status !== "active" || milestone.status !== "approved")
        throw new ChainReviewError("INVALID_LOCAL_RELEASE_STATE", {
          txSig: e.txSig,
        });
      await applyMilestoneRelease(tx, {
        contract,
        milestone,
        actorWallet: c.actor,
        txSig: e.txSig,
      });
    }
  } else {
    if (
      !dispute ||
      dispute.status === "resolved" ||
      contract.status !== "disputed" ||
      milestone.status !== "disputed"
    )
      throw new ChainReviewError("INVALID_LOCAL_SETTLEMENT_STATE", {
        txSig: e.txSig,
      });
    await tx.dispute.update({
      where: { id: dispute.id },
      data: {
        status: "resolved",
        resolvedAt: new Date(),
        proposedOutcome: c.outcome,
        settledAmountUnits: c.amount,
        resolvedBy: c.actor,
        resolutionKind: e.kind,
      },
    });
    if (release) {
      await tx.milestone.update({
        where: { id: milestone.id },
        data: { status: "approved" },
      });
      await applyMilestoneRelease(tx, {
        contract,
        milestone: { ...milestone, status: "approved" },
        actorWallet: c.actor,
        txSig: e.txSig,
      });
    } else {
      const amount = contract.fundedAmount
        .minus(contract.releasedAmount)
        .minus(contract.refundedAmount);
      if (decimalToTokenUnits(amount).toString() !== c.amount)
        throw new ChainReviewError("REFUND_LEDGER_MISMATCH");
      await tx.contract.update({
        where: { id: contract.id },
        data: {
          status: "cancelled",
          refundedAmount: contract.refundedAmount.plus(amount),
        },
      });
      await recordEvent(tx, {
        contractId: contract.id,
        milestoneId: milestone.id,
        actorWallet: c.actor,
        eventType: "contract_refunded",
        txSig: e.txSig,
        payload: { amount: amount.toString() },
      });
    }
    await recordEvent(tx, {
      contractId: contract.id,
      milestoneId: milestone.id,
      actorWallet: c.actor,
      eventType: "contract_dispute_resolved",
      txSig: e.txSig,
      payload: { outcome: c.outcome! },
    });
  }
}
import { hashMilestoneId } from "@/lib/blockchain/solana-escrow-accounts";
const digestMilestone = (id: string) => hashMilestoneId(id).toString("hex");

export function canRevalidateChainReview(status: string, code: string | null) {
  return status !== "review" || ["UNEXPLAINED_WRITABLE_ESCROW", "VERSIONED_ENVELOPE_UNSUPPORTED"].includes(code ?? "");
}

export async function syncContractChain(
  contractId: string,
  walletAddress?: string,
  lease?: { transactionId: string; leaseId: string },
) {
  const original = assertFound(
    await db.contract.findUnique({
      where: { id: contractId },
      include: { milestones: true },
    }),
    "Contract not found",
  );
  if (walletAddress)
    assertAllowed(
      [
        original.creatorWallet,
        original.workerWallet,
        original.arbitratorWallet,
      ].includes(walletAddress),
      "Only contract participants or the designated arbitrator can synchronize",
    );
  assertState(
    canRevalidateChainReview(original.chainSyncStatus, original.chainReviewCode),
    "Contract requires manual chain review",
  );
  try {
    const base = await baseChainContext(contractId);
    let snapshot: ChainSnapshot | undefined;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        snapshot = await readChainHistory(
          base,
          original.milestones.map((m) => m.id),
        );
        break;
      } catch (error) {
        if (error instanceof ChainReviewError || attempt === 2) throw error;
      }
    }
    if (!snapshot) throw new Error("Chain snapshot unavailable");
    const s = snapshot;
    await db.$transaction(
      async (tx) => {
        const contract = await lockContract(tx, contractId);
        assertState(
          contract.businessRevision === original.businessRevision,
          "Contract changed during synchronization; retry",
        );
        assertState(
          canRevalidateChainReview(contract.chainSyncStatus, contract.chainReviewCode),
          "Contract requires manual chain review",
        );
        if (lease) {
          const operation = await tx.escrowTransaction.findUniqueOrThrow({
            where: { id: lease.transactionId },
          });
          assertState(
            operation.reconciliationLeaseId === lease.leaseId &&
              !!operation.reconciliationLeaseExpiresAt &&
              operation.reconciliationLeaseExpiresAt > new Date(),
            "Reconciliation lease expired",
          );
        }
        for (const e of s.instructions) {
          const key = {
            networkGenesisHash: s.identity.genesisHash,
            programId: s.identity.programId.toBase58(),
            txSig: e.txSig,
            instructionIndex: e.instructionIndex,
          };
          const exists = await tx.chainAppliedInstruction.findUnique({
            where: { networkGenesisHash_programId_txSig_instructionIndex: key },
          });
          if (exists) {
            if (exists.evidenceHash !== e.evidenceHash)
              throw new ChainReviewError("EVIDENCE_CHANGED");
            continue;
          }
          await applyEvidence(tx, e);
          await tx.chainAppliedInstruction.create({
            data: {
              ...key,
              contractId,
              slot: e.slot,
              transactionIndex: e.transactionIndex,
              kind: e.kind,
              parameters: e.context as unknown as Prisma.InputJsonValue,
              evidenceHash: e.evidenceHash,
            },
          });
        }
        const current = await tx.contract.findUniqueOrThrow({
          where: { id: contractId },
        });
        if (
          decimalToTokenUnits(current.fundedAmount) !== s.funded ||
          decimalToTokenUnits(current.releasedAmount) !== s.released ||
          decimalToTokenUnits(current.refundedAmount) !== s.refunded
        )
          throw new ChainReviewError("LOCAL_LEDGER_MISMATCH", {
            observedFundedUnits: s.funded.toString(),
            observedReleasedUnits: s.released.toString(),
            observedRefundedUnits: s.refunded.toString(),
          });
        s.businessRevision = current.businessRevision + BigInt(1);
        const last = s.instructions.at(-1);
        await tx.contract.update({
          where: { id: contractId },
          data: {
            chainSyncStatus: "synced",
            chainReviewAt: null,
            chainReviewCode: null,
            chainReviewEvidence: Prisma.DbNull,
            chainBaselineKind: s.baseline,
            chainBaselineEvidence: {
              genesisHash: s.identity.genesisHash,
              programId: s.identity.programId.toBase58(),
              mint: s.identity.mint.toBase58(),
              programHash: s.identity.programHash,
              head: s.head,
              slot: s.slot.toString(),
              extraTokenUnits: s.extra.toString(),
            },
            chainLastSyncedSlot: s.slot,
            chainLastSyncedTransactionIndex: last?.transactionIndex ?? null,
            chainLastSyncedInstructionIndex: last?.instructionIndex ?? null,
            businessRevision: { increment: 1 },
          },
        });
        const pending = await tx.escrowTransaction.findMany({
          where: {
            contractId,
            mode: "onchain",
            status: { in: ["signed", "submitted", "confirmed"] },
            txSig: { not: null },
          },
        });
        for (const operation of pending) {
          const evidence = s.instructions.find(
            (e) => e.txSig === operation.txSig && e.kind === operation.kind,
          );
          if (!evidence) continue;
          if (
            operation.messageHash &&
            evidence.evidenceHash !== operation.messageHash
          )
            throw new ChainReviewError("PREPARED_EVIDENCE_MISMATCH");
          await tx.escrowTransaction.update({
            where: { id: operation.id },
            data: {
              status: "reconciled",
              contractLockKey: null,
              confirmedAt: new Date(),
              reconciledAt: new Date(),
              finalizedSlot: evidence.slot,
              finalizedTransactionIndex: evidence.transactionIndex,
              errorCode: null,
              errorMessage: null,
              requiresReviewAt: null,
              nextAttemptAt: null,
              reconciliationLeaseId: null,
              reconciliationLeaseExpiresAt: null,
            },
          });
        }
      },
      { timeout: 20000 },
    );
    return s;
  } catch (error) {
    // A local CAS race is retriable and must not quarantine a valid snapshot.
    if (
      error instanceof Error &&
      (error.message.includes("changed during") ||
        error.message.includes("lease expired"))
    )
      throw error;
    await markChainProblem(contractId, error);
    throw error;
  }
}
