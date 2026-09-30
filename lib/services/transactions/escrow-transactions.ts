import type {
  EscrowTransaction,
  EscrowTransactionAction,
  EscrowTransactionMode,
  Prisma,
} from "@prisma/client";
import { assertState } from "@/lib/services/errors";

type TransactionClient = Prisma.TransactionClient;

type CreateEscrowTransactionInput = {
  contractId: string;
  milestoneId?: string | null;
  action: EscrowTransactionAction;
  mode: EscrowTransactionMode;
  walletAddress: string;
  amount?: Prisma.Decimal | null;
  idempotencyKey: string;
};

function getOperationKey(input: CreateEscrowTransactionInput) {
  if (input.action === "fund" || input.action === "refund") {
    return `${input.action}:${input.contractId}`;
  }

  assertState(
    Boolean(input.milestoneId),
    `${input.action} transaction requires a milestone`,
  );
  return `${input.action}:${input.milestoneId}`;
}

function sameNullableValue(left: string | null, right?: string | null) {
  return left === (right ?? null);
}

export function assertEscrowTransactionMatches(
  transaction: EscrowTransaction,
  input: CreateEscrowTransactionInput,
) {
  const amountsMatch =
    transaction.amount && input.amount
      ? transaction.amount.equals(input.amount)
      : transaction.amount == null && input.amount == null;

  assertState(
    transaction.contractId === input.contractId,
    "Idempotency key belongs to another contract",
  );
  assertState(
    sameNullableValue(transaction.milestoneId, input.milestoneId),
    "Idempotency key belongs to another milestone",
  );
  assertState(
    transaction.action === input.action,
    "Idempotency key belongs to another action",
  );
  assertState(
    transaction.mode === input.mode,
    "Idempotency key belongs to another escrow mode",
  );
  assertState(
    transaction.walletAddress === input.walletAddress,
    "Idempotency key belongs to another wallet",
  );
  assertState(amountsMatch, "Idempotency key belongs to another amount");
  assertState(
    transaction.operationKey === getOperationKey(input),
    "Idempotency key belongs to another operation",
  );
}

export async function getOrCreateEscrowTransaction(
  tx: TransactionClient,
  input: CreateEscrowTransactionInput,
) {
  const existing = await tx.escrowTransaction.findUnique({
    where: { idempotencyKey: input.idempotencyKey },
  });

  if (existing) {
    assertEscrowTransactionMatches(existing, input);
    return existing;
  }

  const inProgress = await tx.escrowTransaction.findFirst({
    where: {
      contractId: input.contractId,
      status: {
        in: ["building", "prepared", "signed", "submitted", "confirmed"],
      },
    },
    orderBy: { createdAt: "desc" },
  });

  assertState(
    !inProgress,
    `Another ${input.action} transaction is already in progress`,
  );

  return tx.escrowTransaction.create({
    data: {
      contractId: input.contractId,
      milestoneId: input.milestoneId ?? null,
      action: input.action,
      mode: input.mode,
      walletAddress: input.walletAddress,
      amount: input.amount ?? null,
      idempotencyKey: input.idempotencyKey,
      operationKey: getOperationKey(input),
    },
  });
}
