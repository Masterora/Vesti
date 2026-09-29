import { db } from "@/lib/db";
import { getEscrowAdapterMode } from "@/lib/blockchain/escrow-adapter";
import { reconcileFundEscrowTransaction } from "@/lib/blockchain/solana-escrow-reconciliation";
import { applyContractFunded } from "@/lib/services/contracts/apply-contract-funded";
import { assertAllowed, assertFound, assertState } from "@/lib/services/errors";
import { serializeContractWithProfiles } from "@/lib/services/serialize";
import { submitEscrowTransaction } from "@/lib/services/transactions/submit-escrow-transaction";
import type { ConfirmFundTransactionInput } from "@/lib/validations/transaction";

const contractInclude = {
  milestones: {
    orderBy: { index: "asc" as const },
    include: { proofSubmissions: { orderBy: { version: "desc" as const } } }
  },
  events: { orderBy: { createdAt: "desc" as const } }
};

export async function confirmFundTransaction(input: ConfirmFundTransactionInput) {
  const mode = getEscrowAdapterMode();

  if (mode === "mock") {
    return {
      mode,
      action: "fund_contract" as const,
      contractId: input.contractId,
      confirmed: false,
      canUseDirectAction: true,
      message: "Mock escrow mode does not confirm wallet-signed transactions."
    };
  }

  const contract = assertFound(
    await db.contract.findUnique({
      where: { id: input.contractId },
      include: { milestones: { orderBy: { index: "asc" } } }
    }),
    "Contract not found"
  );
  assertAllowed(input.walletAddress === contract.creatorWallet, "Only the Creator can confirm funding");

  const transaction = assertFound(
    await db.escrowTransaction.findUnique({ where: { id: input.transactionId } }),
    "Prepared funding transaction not found"
  );
  assertState(transaction.contractId === contract.id, "Prepared transaction belongs to another contract");
  assertState(transaction.action === "fund", "Prepared transaction is not a funding transaction");
  assertState(transaction.mode === "onchain", "Prepared transaction is not an on-chain transaction");
  assertState(transaction.walletAddress === input.walletAddress, "Prepared transaction belongs to another wallet");

  if (transaction.status === "reconciled") {
    return {
      mode,
      action: "fund_contract" as const,
      confirmed: true,
      contract: await serializeContractWithProfiles(
        await db.contract.findUniqueOrThrow({ where: { id: contract.id }, include: contractInclude })
      )
    };
  }

  assertState(["prepared", "submitted"].includes(transaction.status), "Funding transaction cannot be confirmed");
  assertState(contract.status === "draft", "Only draft contracts can be funded");
  assertState(Boolean(contract.workerWallet), "Assigned Worker wallet is required before funding");

  await submitEscrowTransaction({
    contractId: contract.id,
    walletAddress: input.walletAddress,
    transactionId: transaction.id,
    txSig: input.txSig
  });

  const reconciliation = await reconcileFundEscrowTransaction({
    txSig: input.txSig,
    contractId: contract.id,
    creatorWallet: contract.creatorWallet,
    workerWallet: contract.workerWallet!,
    disputePolicy: contract.disputePolicy,
    arbitratorWallet: contract.arbitratorWallet,
    totalAmount: contract.totalAmount
  });

  return db.$transaction(async (tx) => {
    const currentTransaction = await tx.escrowTransaction.findUniqueOrThrow({
      where: { id: transaction.id }
    });
    if (currentTransaction.status === "reconciled") {
      return {
        mode,
        action: "fund_contract" as const,
        confirmed: true,
        contract: await serializeContractWithProfiles(
          await tx.contract.findUniqueOrThrow({ where: { id: contract.id }, include: contractInclude })
        )
      };
    }

    const currentContract = assertFound(
      await tx.contract.findUnique({
        where: { id: contract.id },
        include: { milestones: { orderBy: { index: "asc" } } }
      }),
      "Contract not found"
    );
    assertState(currentContract.status === "draft", "Only draft contracts can be funded");

    await applyContractFunded(tx, {
      contract: currentContract,
      actorWallet: input.walletAddress,
      escrowAccount: reconciliation.escrowAccount,
      txSig: input.txSig
    });
    await tx.escrowTransaction.update({
      where: { id: transaction.id },
      data: {
        status: "reconciled",
        confirmedAt: new Date(),
        reconciledAt: new Date(),
        errorCode: null,
        errorMessage: null,
        nextAttemptAt: null,
        requiresReviewAt: null,
        reconciliationLeaseId: null,
        reconciliationLeaseExpiresAt: null
      }
    });

    return {
      mode,
      action: "fund_contract" as const,
      confirmed: true,
      confirmation: reconciliation.confirmation,
      contract: await serializeContractWithProfiles(
        await tx.contract.findUniqueOrThrow({ where: { id: contract.id }, include: contractInclude })
      )
    };
  });
}
