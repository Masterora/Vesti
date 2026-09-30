import { db } from "@/lib/db";
import { assertAllowed, assertFound, assertState } from "@/lib/services/errors";
import type { SubmitEscrowTransactionInput } from "@/lib/validations/transaction";

export async function submitEscrowTransaction(
  input: SubmitEscrowTransactionInput,
) {
  const transaction = assertFound(
    await db.escrowTransaction.findUnique({
      where: { id: input.transactionId },
    }),
    "Prepared transaction not found",
  );

  assertAllowed(
    transaction.walletAddress === input.walletAddress,
    "Prepared transaction belongs to another wallet",
  );
  assertState(
    transaction.contractId === input.contractId,
    "Prepared transaction belongs to another contract",
  );
  assertState(
    transaction.milestoneId === (input.milestoneId ?? null),
    "Prepared transaction belongs to another milestone",
  );
  assertState(
    transaction.mode === "onchain",
    "Prepared transaction is not an on-chain transaction",
  );
  assertState(
    transaction.contextVersion === 1 && Boolean(transaction.signedTransaction),
    "Persist the signed transaction before broadcasting",
  );
  assertState(
    transaction.txSig === input.txSig,
    "Transaction signature differs from the saved signed message",
  );
  assertState(
    ["signed", "submitted", "confirmed", "reconciled"].includes(
      transaction.status,
    ),
    "Transaction cannot be submitted",
  );
  await db.escrowTransaction.updateMany({
    where: { id: transaction.id, status: "signed" },
    data: {
      status: "submitted",
      submittedAt: new Date(),
      nextAttemptAt: new Date(),
    },
  });
  return db.escrowTransaction.findUniqueOrThrow({
    where: { id: transaction.id },
  });
}
