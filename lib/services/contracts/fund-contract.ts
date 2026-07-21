import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { getEscrowAdapter, getEscrowAdapterMode } from "@/lib/blockchain/escrow-adapter";
import { applyContractFunded } from "@/lib/services/contracts/apply-contract-funded";
import { assertAllowed, assertFound, assertState } from "@/lib/services/errors";
import { serializeContractWithProfiles } from "@/lib/services/serialize";
import {
  assertEscrowTransactionMatches,
  getOrCreateEscrowTransaction
} from "@/lib/services/transactions/escrow-transactions";
import type { FundContractInput } from "@/lib/validations/contract";

export async function fundContract(input: FundContractInput) {
  const mode = getEscrowAdapterMode();
  assertState(mode === "mock", "Use the wallet-signed funding flow in on-chain mode");
  const adapter = getEscrowAdapter();
  const idempotencyKey = input.idempotencyKey ?? randomUUID();

  const contract = assertFound(
    await db.contract.findUnique({
      where: { id: input.contractId },
      include: { milestones: { orderBy: { index: "asc" } } }
    }),
    "Contract not found"
  );

  assertAllowed(input.walletAddress === contract.creatorWallet, "Only the Creator can fund this contract");

  const existingTransaction = await db.escrowTransaction.findUnique({ where: { idempotencyKey } });
  if (existingTransaction) {
    assertEscrowTransactionMatches(existingTransaction, {
      contractId: contract.id,
      action: "fund",
      mode,
      walletAddress: input.walletAddress,
      amount: contract.totalAmount,
      idempotencyKey
    });
    if (existingTransaction.status === "reconciled") {
      const existing = await db.contract.findUniqueOrThrow({
        where: { id: contract.id },
        include: {
          milestones: { orderBy: { index: "asc" }, include: { proofSubmissions: true } },
          events: { orderBy: { createdAt: "desc" } }
        }
      });
      return serializeContractWithProfiles(existing);
    }
  }

  assertState(contract.status === "draft", "Only draft contracts can be funded");
  assertState(Boolean(contract.workerWallet), "Assigned Worker wallet is required before funding");

  const transaction = await db.$transaction((tx) =>
    getOrCreateEscrowTransaction(tx, {
      contractId: contract.id,
      action: "fund",
      mode,
      walletAddress: input.walletAddress,
      amount: contract.totalAmount,
      idempotencyKey
    })
  );

  if (transaction.status === "reconciled") {
    const existing = await db.contract.findUniqueOrThrow({
      where: { id: contract.id },
      include: {
        milestones: { orderBy: { index: "asc" }, include: { proofSubmissions: true } },
        events: { orderBy: { createdAt: "desc" } }
      }
    });
    return serializeContractWithProfiles(existing);
  }

  const escrow = await adapter.fundContract({
    contractId: contract.id,
    creatorWallet: contract.creatorWallet,
    workerWallet: contract.workerWallet!,
    amount: contract.totalAmount
  });

  return db.$transaction(async (tx) => {
    const currentTransaction = await tx.escrowTransaction.findUniqueOrThrow({
      where: { id: transaction.id }
    });
    if (currentTransaction.status === "reconciled") {
      const existing = await tx.contract.findUniqueOrThrow({
        where: { id: contract.id },
        include: {
          milestones: { orderBy: { index: "asc" }, include: { proofSubmissions: true } },
          events: { orderBy: { createdAt: "desc" } }
        }
      });
      return serializeContractWithProfiles(existing);
    }

    const currentContract = assertFound(
      await tx.contract.findUnique({
        where: { id: input.contractId },
        include: {
          milestones: {
            orderBy: { index: "asc" }
          }
        }
      }),
      "Contract not found"
    );

    assertState(currentContract.status === "draft", "Only draft contracts can be funded");

    await applyContractFunded(tx, {
      contract: currentContract,
      actorWallet: input.walletAddress,
      escrowAccount: escrow.escrowAccount,
      txSig: escrow.txSig
    });

    await tx.escrowTransaction.update({
      where: { id: transaction.id },
      data: {
        txSig: escrow.txSig,
        status: "reconciled",
        submittedAt: new Date(),
        confirmedAt: new Date(),
        reconciledAt: new Date()
      }
    });

    const updated = await tx.contract.findUniqueOrThrow({
      where: { id: currentContract.id },
      include: {
        milestones: {
          orderBy: { index: "asc" },
          include: {
            proofSubmissions: {
              orderBy: { version: "desc" }
            }
          }
        },
        events: {
          orderBy: { createdAt: "desc" }
        }
      }
    });

    return serializeContractWithProfiles(updated);
  });
}
