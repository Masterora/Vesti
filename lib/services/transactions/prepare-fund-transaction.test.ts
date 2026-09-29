import { Prisma } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  contractFind: vi.fn(),
  transactionFind: vi.fn(),
  transactionUpdate: vi.fn(),
  transactionUpdateMany: vi.fn(),
  dbTransaction: vi.fn(),
  inspect: vi.fn(),
  prepare: vi.fn(),
  getOrCreate: vi.fn()
}));

vi.mock("@/lib/db", () => ({
  db: {
    contract: { findUnique: mocks.contractFind },
    escrowTransaction: {
      findUnique: mocks.transactionFind,
      update: mocks.transactionUpdate,
      updateMany: mocks.transactionUpdateMany
    },
    $transaction: mocks.dbTransaction
  }
}));
vi.mock("@/lib/blockchain/escrow-adapter", () => ({ getEscrowAdapterMode: () => "onchain" }));
vi.mock("@/lib/blockchain/solana-escrow-transactions", () => ({
  inspectPreparedFunding: mocks.inspect,
  prepareFundEscrowTransaction: mocks.prepare
}));
vi.mock("@/lib/services/transactions/escrow-transactions", () => ({
  assertEscrowTransactionMatches: vi.fn(),
  getOrCreateEscrowTransaction: mocks.getOrCreate
}));

import { prepareFundTransaction } from "./prepare-fund-transaction";

const contract = {
  id: "contract-1",
  creatorWallet: "creator",
  workerWallet: "worker",
  status: "draft",
  totalAmount: new Prisma.Decimal("10")
};
const oldRecord = {
  id: "old-transaction",
  idempotencyKey: "old-key",
  status: "prepared",
  txSig: null,
  preparedTransaction: "old-base64",
  recentBlockhash: "old-blockhash",
  requiresReviewAt: null,
  createdAt: new Date(Date.now() - 10 * 60_000),
  updatedAt: new Date(Date.now() - 10 * 60_000)
};
const input = { contractId: contract.id, walletAddress: contract.creatorWallet, idempotencyKey: "new-key" };

beforeEach(() => {
  vi.resetAllMocks();
  mocks.contractFind.mockResolvedValue(contract);
  mocks.transactionFind.mockImplementation(async ({ where }: { where: { idempotencyKey?: string } }) =>
    where.idempotencyKey ? null : oldRecord
  );
  mocks.transactionUpdateMany.mockResolvedValue({ count: 1 });
  mocks.dbTransaction.mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) => callback({}));
  mocks.getOrCreate.mockResolvedValue({ id: "new-transaction" });
  mocks.prepare.mockResolvedValue({ transaction: "new-base64", recentBlockhash: "new-blockhash" });
});

describe("prepared funding recovery", () => {
  it("reuses the existing transaction while its blockhash is valid", async () => {
    mocks.inspect.mockResolvedValue("valid");
    const result = await prepareFundTransaction(input);
    expect(result.transactionId).toBe(oldRecord.id);
    expect(result.transaction).toBe(oldRecord.preparedTransaction);
    expect(mocks.transactionUpdateMany).not.toHaveBeenCalled();
    expect(mocks.prepare).not.toHaveBeenCalled();
  });

  it("releases the operation only after safe expiry and creates a new preparation", async () => {
    mocks.inspect.mockResolvedValue("expired_without_escrow");
    const result = await prepareFundTransaction(input);
    expect(mocks.transactionUpdateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ status: "prepared", txSig: null, requiresReviewAt: null }),
      data: expect.objectContaining({ status: "failed", operationKey: null })
    }));
    expect(result.transactionId).toBe("new-transaction");
    expect(mocks.prepare).toHaveBeenCalledTimes(1);
  });

  it("waits for finality when an expired preparation was written recently", async () => {
    mocks.transactionFind.mockImplementation(async ({ where }: { where: { idempotencyKey?: string } }) =>
      where.idempotencyKey ? null : { ...oldRecord, updatedAt: new Date() }
    );
    mocks.inspect.mockResolvedValue("expired_without_escrow");
    await expect(prepareFundTransaction(input)).rejects.toThrow("wait for finality");
    expect(mocks.transactionUpdateMany).not.toHaveBeenCalled();
    expect(mocks.prepare).not.toHaveBeenCalled();
  });

  it("holds an ambiguous preparation for manual review", async () => {
    mocks.inspect.mockResolvedValue("review");
    await expect(prepareFundTransaction(input)).rejects.toThrow("manual review");
    expect(mocks.transactionUpdateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ requiresReviewAt: expect.any(Date) })
    }));
    expect(mocks.prepare).not.toHaveBeenCalled();
  });
});
