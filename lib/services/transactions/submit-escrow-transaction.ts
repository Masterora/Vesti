import { db } from "@/lib/db";
import { assertAllowed, assertFound, assertState } from "@/lib/services/errors";
import type { SubmitEscrowTransactionInput } from "@/lib/validations/transaction";

export async function submitEscrowTransaction(input: SubmitEscrowTransactionInput) {
  const transaction = assertFound(
    await db.escrowTransaction.findUnique({ where: { id: input.transactionId } }),
    "Prepared transaction not found"
  );

  assertAllowed(transaction.walletAddress === input.walletAddress, "Prepared transaction belongs to another wallet");
  assertState(transaction.contractId === input.contractId, "Prepared transaction belongs to another contract");
  assertState(
    transaction.milestoneId === (input.milestoneId ?? null),
    "Prepared transaction belongs to another milestone"
  );
  assertState(transaction.mode === "onchain", "Prepared transaction is not an on-chain transaction");
  assertState(["fund", "release"].includes(transaction.action), "Prepared transaction action cannot be submitted");

  if (transaction.status === "reconciled") {
    assertState(transaction.txSig === input.txSig, "Prepared transaction already has another signature");
    return transaction;
  }

  assertState(["prepared", "submitted"].includes(transaction.status), "Prepared transaction cannot be submitted");

  if (transaction.txSig) {
    assertState(transaction.txSig === input.txSig, "Prepared transaction already has another signature");
    return transaction;
  }

  const submittedAt = new Date();
  const claimed = await db.escrowTransaction.updateMany({
    where: {
      id: transaction.id,
      status: "prepared",
      txSig: null
    },
    data: {
      txSig: input.txSig,
      status: "submitted",
      submittedAt,
      nextAttemptAt: submittedAt,
      errorCode: null,
      errorMessage: null
    }
  });

  if (claimed.count !== 1) {
    const current = await db.escrowTransaction.findUniqueOrThrow({ where: { id: transaction.id } });
    assertState(current.txSig === input.txSig, "Prepared transaction already has another signature");
    return current;
  }

  return db.escrowTransaction.findUniqueOrThrow({ where: { id: transaction.id } });
}
