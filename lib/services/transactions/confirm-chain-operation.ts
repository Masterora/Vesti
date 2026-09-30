import type { EscrowTransactionKind } from "@prisma/client";
import { db } from "@/lib/db";
import { recoverChainOperationAsOwner } from "./chain-operations";
import { assertAllowed, assertFound, assertState } from "@/lib/services/errors";
import { serializeParticipantContract } from "@/lib/services/contracts/filter-worker-contract";
import { serializeArbitratorContract } from "@/lib/services/contracts/filter-arbitrator-contract";
export async function confirmChainOperation(
  input: {
    transactionId: string;
    contractId: string;
    milestoneId?: string;
    walletAddress: string;
    txSig: string;
  },
  kind?: EscrowTransactionKind,
) {
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
  assertState(
    operation.contractId === input.contractId &&
      operation.milestoneId === (input.milestoneId ?? null) &&
      (!kind || operation.kind === kind) &&
      operation.txSig === input.txSig,
    "Transaction context or signature mismatch",
  );
  const result = await recoverChainOperationAsOwner(input);
  const contract = await db.contract.findUniqueOrThrow({
    where: { id: operation.contractId },
    include: {
      milestones: {
        orderBy: { index: "asc" },
        include: { proofSubmissions: { orderBy: { version: "desc" } } },
      },
      disputes: { orderBy: { createdAt: "desc" } },
      events: { orderBy: { createdAt: "desc" } },
      escrowTransactions: { orderBy: { createdAt: "desc" } },
    },
  });
  return {
    mode: "onchain",
    confirmed: result.status === "reconciled",
    status: result.status,
    contract:
      input.walletAddress === contract.arbitratorWallet
        ? await serializeArbitratorContract(contract)
        : await serializeParticipantContract(contract, input.walletAddress),
  };
}
