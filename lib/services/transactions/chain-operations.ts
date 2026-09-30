import { randomUUID } from "node:crypto";
import type {
  EscrowTransaction,
  EscrowTransactionKind,
  Prisma,
} from "@prisma/client";
import { db } from "@/lib/db";
import {
  buildProtocolTransaction,
  disputeCapability,
  digest,
  chainIdentity,
  ChainReviewError,
  assertChainContextIdentity,
  type ChainContext,
} from "@/lib/blockchain/chain-protocol";
import { verifySignedMessage } from "@/lib/blockchain/chain-history";
import { decimalToTokenUnits } from "@/lib/blockchain/solana-escrow-accounts";
import { lockContract } from "@/lib/services/contracts/contract-lock";
import { baseChainContext, syncContractChain } from "./chain-sync";
import {
  assertAllowed,
  assertFound,
  assertState,
  ServiceError,
} from "@/lib/services/errors";
import { serializeEscrowTransaction } from "@/lib/services/serialize";

export type PrepareChainInput = {
  contractId: string;
  milestoneId?: string;
  walletAddress: string;
  idempotencyKey: string;
  kind: EscrowTransactionKind;
  reason?: string;
  outcome?: "release_to_worker" | "refund_to_creator";
  expectedProposalVersion?: string;
};
const pendingStatuses = [
  "building",
  "prepared",
  "signed",
  "submitted",
  "confirmed",
] as const;
function preparedResult(operation: EscrowTransaction) {
  return {
    mode: "onchain",
    action: operation.kind === "fund" ? "fund_contract" : "release_milestone",
    contractId: operation.contractId,
    milestoneId: operation.milestoneId ?? undefined,
    transactionId: operation.id,
    idempotencyKey: operation.idempotencyKey,
    transaction:
      operation.status === "prepared" ? operation.preparedTransaction : null,
    status: operation.status,
    canUseDirectAction: false,
    messageHash: operation.messageHash,
    lastValidBlockHeight: operation.lastValidBlockHeight?.toString(),
    recentBlockhash: operation.recentBlockhash,
    summary: operation.operationContext,
  };
}
function sameRequest(operation: EscrowTransaction, input: PrepareChainInput) {
  const c = operation.operationContext as ChainContext | null;
  assertAllowed(
    operation.walletAddress === input.walletAddress,
    "Transaction belongs to another wallet",
  );
  assertState(
    operation.contractId === input.contractId &&
      operation.milestoneId === (input.milestoneId ?? null) &&
      operation.kind === input.kind,
    "Idempotency key belongs to another operation",
  );
  assertState(
    c?.reason === (input.reason ?? undefined) &&
      c?.outcome === (input.outcome ?? c?.outcome),
    "Idempotency parameters changed",
  );
  if (input.expectedProposalVersion !== undefined)
    assertState(
      c?.version === input.expectedProposalVersion,
      "Idempotency proposal version changed",
    );
}
export async function prepareChainOperation(input: PrepareChainInput) {
  assertState(
    process.env.ESCROW_ADAPTER_MODE === "onchain",
    "On-chain mode is required",
  );
  const existing = await db.escrowTransaction.findUnique({
    where: { idempotencyKey: input.idempotencyKey },
  });
  if (existing) {
    sameRequest(existing, input);
    return preparedResult(existing);
  }
  if (input.kind.startsWith("dispute") && !(await disputeCapability()))
    throw new ServiceError("On-chain dispute capability is unavailable", 503);
  const auth = assertFound(
    await db.contract.findUnique({ where: { id: input.contractId } }),
    "Contract not found",
  );
  assertAllowed(
    [auth.creatorWallet, auth.workerWallet, auth.arbitratorWallet].includes(
      input.walletAddress,
    ),
    "Only contract participants can prepare transactions",
  );
  const active = await db.escrowTransaction.findFirst({
    where: {
      contractId: input.contractId,
      contractLockKey: input.contractId,
      status: { in: [...pendingStatuses] },
    },
  });
  if (active) {
    sameRequest(active, input);
    if (active.status === "prepared") {
      await recoverChainOperation(active.id);
      return preparedResult(
        await db.escrowTransaction.findUniqueOrThrow({
          where: { id: active.id },
        }),
      );
    }
    return preparedResult(active);
  }
  await syncContractChain(input.contractId, input.walletAddress);
  const base = await baseChainContext(input.contractId);
  const operation = await db.$transaction(async (tx) => {
    const contract = await lockContract(tx, input.contractId, true);
    assertState(
      contract.creatorWallet === base.creator &&
        contract.workerWallet === base.worker &&
        contract.disputePolicy === base.policy &&
        contract.arbitratorWallet === base.arbitrator &&
        decimalToTokenUnits(contract.totalAmount).toString() === base.amount,
      "Contract binding changed during preparation",
    );
    const repeated = await tx.escrowTransaction.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
    });
    if (repeated) {
      sameRequest(repeated, input);
      return repeated;
    }
    assertState(
      contract.chainSyncStatus === "synced",
      "Chain state is not synchronized",
    );
    const milestone = input.milestoneId
      ? assertFound(
          await tx.milestone.findFirst({
            where: { id: input.milestoneId, contractId: input.contractId },
          }),
          "Milestone not found",
        )
      : null;
    const dispute = milestone
      ? await tx.dispute.findUnique({ where: { milestoneId: milestone.id } })
      : null;
    const participant = [
      contract.creatorWallet,
      contract.workerWallet,
    ].includes(input.walletAddress);
    let amount = "0",
      logicalKey: string,
      outcome = input.outcome;
    if (input.kind === "fund") {
      assertAllowed(
        input.walletAddress === contract.creatorWallet,
        "Only the Creator can prepare funding",
      );
      assertState(
        contract.status === "draft" && !!contract.workerWallet,
        "Only an assigned draft contract can be funded",
      );
      assertState(
        ["absent", "initialized"].includes(contract.chainBaselineKind),
        "Contract already funded",
      );
      amount = decimalToTokenUnits(contract.totalAmount).toString();
      logicalKey = `fund:${contract.id}`;
    } else if (input.kind === "release") {
      assertAllowed(
        input.walletAddress === contract.creatorWallet,
        "Only the Creator can prepare payment release",
      );
      assertState(
        contract.status === "active" && milestone?.status === "approved",
        "Only approved milestones on an active contract can be released",
      );
      amount = decimalToTokenUnits(milestone!.amount).toString();
      logicalKey = `release:${milestone!.id}`;
    } else if (input.kind === "dispute_open") {
      assertAllowed(
        participant,
        "Only the Creator or Worker can open a dispute",
      );
      assertState(
        contract.status === "active" &&
          !!milestone &&
          ["ready", "submitted", "revision_requested", "approved"].includes(
            milestone.status,
          ) &&
          !dispute,
        "Milestone cannot enter dispute",
      );
      assertState(!!input.reason?.trim(), "Dispute reason is required");
      logicalKey = `open:${milestone!.id}`;
    } else {
      assertState(
        contract.status === "disputed" &&
          milestone?.status === "disputed" &&
          !!dispute &&
          dispute.status !== "resolved",
        "Dispute is not unresolved",
      );
      if (input.kind.includes("arbitrate"))
        assertAllowed(
          contract.disputePolicy === "arbitrator" &&
            contract.arbitratorWallet === input.walletAddress,
          "Only the designated arbitrator can arbitrate",
        );
      else {
        assertAllowed(participant, "Only participants can propose or accept");
        assertState(
          input.expectedProposalVersion === dispute!.proposalVersion.toString(),
          "Proposal version changed; refresh and retry",
        );
      }
      if (input.kind === "dispute_propose") {
        assertState(!!outcome, "Proposal outcome is required");
        logicalKey = `propose:${dispute!.id}:${dispute!.proposalVersion + BigInt(1)}`;
      } else {
        logicalKey = `settle:${dispute!.id}`;
        if (input.kind.includes("accept")) {
          assertState(
            dispute!.status === "proposed" &&
              dispute!.proposedBy !== input.walletAddress,
            "The other participant must accept the pending proposal",
          );
          outcome = dispute!.proposedOutcome ?? undefined;
          assertState(
            input.kind.endsWith("release") ===
              (outcome === "release_to_worker"),
            "Proposal outcome changed",
          );
        } else
          outcome = input.kind.endsWith("release")
            ? "release_to_worker"
            : "refund_to_creator";
      }
      amount =
        outcome === "release_to_worker"
          ? decimalToTokenUnits(milestone!.amount).toString()
          : decimalToTokenUnits(
              contract.fundedAmount
                .minus(contract.releasedAmount)
                .minus(contract.refundedAmount),
            ).toString();
    }
    const context: ChainContext = {
      ...base,
      actor: input.walletAddress,
      kind: input.kind,
      milestoneId: input.milestoneId,
      reason: input.reason,
      reasonHash: input.reason ? digest(input.reason) : undefined,
      outcome,
      amount,
      businessRevision: contract.businessRevision.toString(),
      version: dispute?.proposalVersion.toString() ?? "0",
      fundingStage:
        input.kind === "fund"
          ? contract.chainBaselineKind === "initialized"
            ? "fund_existing_initialized"
            : "initialize_and_fund"
          : undefined,
      funded: decimalToTokenUnits(contract.fundedAmount).toString(),
      released: decimalToTokenUnits(contract.releasedAmount).toString(),
      refunded: decimalToTokenUnits(contract.refundedAmount).toString(),
    };
    const last = await tx.escrowTransaction.findFirst({
      where: { logicalOperationKey: logicalKey },
      orderBy: { attempt: "desc" },
    });
    assertState(
      last?.status !== "reconciled",
      "Operation was already completed",
    );
    const attempt = (last?.attempt ?? -1) + 1;
    const nowRows = await tx.$queryRaw<
      { now: Date }[]
    >`SELECT clock_timestamp() AS now`;
    return tx.escrowTransaction.create({
      data: {
        contractId: contract.id,
        milestoneId: milestone?.id ?? null,
        kind: input.kind,
        action:
          input.kind === "fund"
            ? "fund"
            : input.kind === "release"
              ? "release"
              : input.kind.endsWith("refund")
                ? "refund"
                : input.kind.endsWith("release")
                  ? "resolve"
                  : "dispute",
        mode: "onchain",
        walletAddress: input.walletAddress,
        amount:
          input.kind === "fund"
            ? contract.totalAmount
            : input.kind === "dispute_open" || input.kind === "dispute_propose"
              ? null
              : outcome === "refund_to_creator"
                ? contract.fundedAmount
                    .minus(contract.releasedAmount)
                    .minus(contract.refundedAmount)
                : milestone!.amount,
        idempotencyKey: input.idempotencyKey,
        logicalOperationKey: logicalKey,
        attempt,
        operationKey: `${logicalKey}:attempt:${attempt}`,
        contractLockKey: contract.id,
        contextVersion: 1,
        operationContext: JSON.parse(
          JSON.stringify(context),
        ) as Prisma.InputJsonValue,
        status: "building",
        buildToken: randomUUID(),
        buildExpiresAt: new Date(nowRows[0].now.getTime() + 120000),
      },
    });
  });
  if (operation.status !== "building") return preparedResult(operation);
  try {
    const prepared = await buildProtocolTransaction(
      operation.operationContext as ChainContext,
    );
    const committed = await db.$transaction(async (tx) => {
      const contract = await lockContract(tx, input.contractId);
      assertState(
        contract.chainSyncStatus === "synced" &&
          contract.businessRevision.toString() ===
            (operation.operationContext as ChainContext).businessRevision,
        "Contract synchronization changed during preparation",
      );
      const clock = await tx.$queryRaw<
        { now: Date }[]
      >`SELECT clock_timestamp() AS now`;
      const updated = await tx.escrowTransaction.updateMany({
        where: {
          id: operation.id,
          status: "building",
          buildToken: operation.buildToken,
          buildExpiresAt: { gt: clock[0].now },
          contractLockKey: input.contractId,
        },
        data: {
          preparedTransaction: prepared.transaction,
          messageHash: prepared.messageHash,
          recentBlockhash: prepared.recentBlockhash,
          lastValidBlockHeight: prepared.lastValidBlockHeight,
          status: "prepared",
        },
      });
      assertState(
        updated.count === 1,
        "Build expired or was replaced; refresh and retry",
      );
      return tx.escrowTransaction.findUniqueOrThrow({
        where: { id: operation.id },
      });
    });
    return preparedResult(committed);
  } catch (error) {
    await db.$transaction(async (tx) => {
      await lockContract(tx, input.contractId);
      await tx.escrowTransaction.updateMany({
        where: {
          id: operation.id,
          status: "building",
          buildToken: operation.buildToken,
        },
        data: {
          status: "failed",
          contractLockKey: null,
          errorCode: "BUILD_FAILED",
          errorMessage: "Transaction preparation failed",
        },
      });
    });
    throw error;
  }
}
export async function recordSignedOperation(input: {
  transactionId: string;
  walletAddress: string;
  signedTransaction: string;
}) {
  const original = assertFound(
    await db.escrowTransaction.findUnique({
      where: { id: input.transactionId },
    }),
    "Transaction not found",
  );
  assertAllowed(
    original.walletAddress === input.walletAddress,
    "Transaction belongs to another wallet",
  );
  assertState(
    original.contextVersion === 1 && !!original.preparedTransaction,
    "Legacy transaction requires review",
  );
  assertChainContextIdentity(original.operationContext as ChainContext, await chainIdentity());
  const signed = verifySignedMessage(
    original.preparedTransaction!,
    input.signedTransaction,
    input.walletAddress,
  );
  assertState(
    signed.messageHash === original.messageHash,
    "Prepared message hash mismatch",
  );
  return db.$transaction(async (tx) => {
    const contract = await lockContract(tx, original.contractId);
    const operation = await tx.escrowTransaction.findUniqueOrThrow({
      where: { id: original.id },
    });
    if (operation.signedTransaction) {
      assertState(
        operation.signedTransaction === signed.signedTransaction &&
          operation.txSig === signed.txSig,
        "Another signed transaction is already recorded",
      );
      return { txSig: operation.txSig, status: operation.status };
    }
    assertState(
      contract.chainSyncStatus === "synced" &&
        operation.status === "prepared" &&
        operation.contractLockKey === contract.id,
      "Transaction cannot be signed in its current state",
    );
    await tx.escrowTransaction.update({
      where: { id: operation.id },
      data: {
        ...signed,
        status: "signed",
        signedAt: new Date(),
        nextAttemptAt: new Date(),
      },
    });
    return { txSig: signed.txSig, status: "signed" };
  });
}
export async function operationStatus(
  transactionId: string,
  walletAddress: string,
) {
  const operation = assertFound(
    await db.escrowTransaction.findUnique({ where: { id: transactionId } }),
    "Transaction not found",
  );
  assertAllowed(
    operation.walletAddress === walletAddress,
    "Transaction belongs to another wallet",
  );
  return serializeEscrowTransaction(operation);
}
export async function recoverChainOperation(
  transactionId: string,
  leaseId?: string,
) {
  let operation = assertFound(
    await db.escrowTransaction.findUnique({ where: { id: transactionId } }),
    "Transaction not found",
  );
  if (operation.status === "reconciled" || operation.status === "failed")
    return operation;
  if (operation.status === "building") {
    await db.$transaction(async (tx) => {
      await lockContract(tx, operation.contractId);
      await tx.$executeRaw`UPDATE "EscrowTransaction" SET status = 'failed', "contractLockKey" = NULL, "errorCode" = 'BUILD_INTERRUPTED', "errorMessage" = 'Preparation interrupted; prepare again', "updatedAt" = CURRENT_TIMESTAMP WHERE id = ${operation.id} AND status = 'building' AND "buildToken" = ${operation.buildToken} AND "buildExpiresAt" < clock_timestamp()`;
    });
    return db.escrowTransaction.findUniqueOrThrow({
      where: { id: transactionId },
    });
  }
  if (operation.contextVersion !== 1) {
    assertState(
      Boolean(operation.txSig) && operation.status !== "prepared",
      "Legacy transaction requires review",
    );
    await syncContractChain(
      operation.contractId,
      undefined,
      leaseId ? { transactionId, leaseId } : undefined,
    );
    const legacy = await db.escrowTransaction.findUniqueOrThrow({
      where: { id: transactionId },
    });
    assertState(
      legacy.status === "reconciled",
      "Legacy transaction evidence requires review",
    );
    return legacy;
  }
  const lease = leaseId ? { transactionId, leaseId } : undefined;
  const identity = await chainIdentity();
  const context = operation.operationContext as ChainContext | null;
  if (!context) {
    throw new ChainReviewError("OPERATION_CHAIN_IDENTITY_CHANGED", { transactionId });
  }
  assertChainContextIdentity(context, identity);
  const connection = identity.connection;
  const status = operation.txSig
    ? (
        await connection.getSignatureStatuses([operation.txSig], {
          searchTransactionHistory: true,
        })
      ).value[0]
    : null;
  const valid =
    operation.lastValidBlockHeight !== null &&
    BigInt(await connection.getBlockHeight("finalized")) <=
      operation.lastValidBlockHeight;
  const expiryBarrierSlot = BigInt(await connection.getSlot("finalized"));
  const snapshot = await syncContractChain(
    operation.contractId,
    undefined,
    lease,
  );
  operation = await db.escrowTransaction.findUniqueOrThrow({
    where: { id: transactionId },
  });
  if (operation.status === "reconciled") return operation;
  if (
    (status?.confirmationStatus === "finalized" && status.err) ||
    (!status && !valid)
  ) {
    // Snapshot proves all finalized business effects. Unknown successful signatures remain locked.
    await db.$transaction(async (tx) => {
      const contract = await lockContract(tx, operation.contractId);
      assertState(
        contract.businessRevision === snapshot.businessRevision &&
          snapshot.slot >= expiryBarrierSlot,
        "Contract changed during expiry verification; retry",
      );
      if (lease) {
        const current = await tx.escrowTransaction.findUniqueOrThrow({
          where: { id: transactionId },
        });
        assertState(
          current.reconciliationLeaseId === leaseId &&
            !!current.reconciliationLeaseExpiresAt &&
            current.reconciliationLeaseExpiresAt > new Date(),
          "Reconciliation lease expired",
        );
      }
      await tx.escrowTransaction.updateMany({
        where: {
          id: transactionId,
          status: { in: [...pendingStatuses] },
          contractLockKey: operation.contractId,
        },
        data: {
          status: "failed",
          contractLockKey: null,
          errorCode: status?.err
            ? "CHAIN_EXECUTION_FAILED"
            : "TRANSACTION_EXPIRED",
          errorMessage: status?.err
            ? "Transaction failed on-chain; prepare again"
            : "Transaction expired; prepare again",
          nextAttemptAt: null,
          reconciliationLeaseId: null,
          reconciliationLeaseExpiresAt: null,
        },
      });
    });
  } else if (operation.signedTransaction && valid && !status) {
    await connection.sendRawTransaction(
      Buffer.from(operation.signedTransaction, "base64"),
      { preflightCommitment: "finalized" },
    );
    await db.escrowTransaction.updateMany({
      where: { id: operation.id, status: "signed" },
      data: { status: "submitted", submittedAt: new Date() },
    });
  } else if (status && !status.err) {
    await db.escrowTransaction.updateMany({
      where: { id: operation.id, status: { in: ["signed", "submitted"] } },
      data: { status: "confirmed", confirmedAt: new Date() },
    });
  }
  void snapshot;
  return db.escrowTransaction.findUniqueOrThrow({
    where: { id: transactionId },
  });
}

export async function recoverChainOperationAsOwner(input: {
  transactionId: string;
  walletAddress: string;
}) {
  const operation = assertFound(
    await db.escrowTransaction.findUnique({
      where: { id: input.transactionId },
    }),
    "Transaction not found",
  );
  assertAllowed(
    operation.walletAddress === input.walletAddress,
    "Transaction belongs to another wallet",
  );
  await recoverChainOperation(operation.id);
  if (operation.errorCode === "RECONCILIATION_RETRY_LIMIT") {
    // An explicit owner retry must first re-prove identity and finalized state.
    await db.$transaction(async (tx) => {
      const contract = await lockContract(tx, operation.contractId);
      assertState(contract.chainSyncStatus === "synced", "Chain state is not synchronized");
      await tx.escrowTransaction.updateMany({
        where: { id: operation.id, errorCode: "RECONCILIATION_RETRY_LIMIT" },
        data: { requiresReviewAt: null, reconciliationAttempts: 0, errorCode: null, errorMessage: null, nextAttemptAt: new Date() },
      });
    });
  }
  return db.escrowTransaction.findUniqueOrThrow({ where: { id: operation.id } });
}

export async function resumePreparedOperation(input: {
  transactionId: string;
  walletAddress: string;
}) {
  return preparedResult(await recoverChainOperationAsOwner(input));
}
