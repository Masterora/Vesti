import { Prisma } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  contractFind: vi.fn(),
  milestoneFind: vi.fn(),
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
    milestone: { findFirst: mocks.milestoneFind },
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
  inspectPreparedRelease: mocks.inspect,
  prepareReleaseEscrowTransaction: mocks.prepare
}));
vi.mock("@/lib/services/transactions/escrow-transactions", () => ({
  assertEscrowTransactionMatches: vi.fn(),
  getOrCreateEscrowTransaction: mocks.getOrCreate
}));

import { prepareReleaseTransaction } from "./prepare-release-transaction";

const contract = {
  id: "contract-1",
  creatorWallet: "creator",
  workerWallet: "worker",
  status: "active",
  fundedAmount: new Prisma.Decimal("10"),
  releasedAmount: new Prisma.Decimal("2")
};
const milestone = { id: "milestone-1", amount: new Prisma.Decimal("3"), status: "approved" };
const oldRecord = {
  id: "old-transaction",
  idempotencyKey: "old-key",
  status: "prepared",
  txSig: null,
  preparedTransaction: "old-base64",
  recentBlockhash: "old-blockhash",
  requiresReviewAt: null,
  updatedAt: new Date(Date.now() - 10 * 60_000)
};
const input = {
  contractId: contract.id,
  milestoneId: milestone.id,
  walletAddress: contract.creatorWallet,
  idempotencyKey: "new-key"
};

beforeEach(() => {
  vi.resetAllMocks();
  mocks.contractFind.mockResolvedValue(contract);
  mocks.milestoneFind.mockResolvedValue(milestone);
  mocks.transactionFind.mockImplementation(async ({ where }: { where: { idempotencyKey?: string } }) =>
    where.idempotencyKey ? null : oldRecord
  );
  mocks.transactionUpdateMany.mockResolvedValue({ count: 1 });
  mocks.dbTransaction.mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) => callback({}));
  mocks.getOrCreate.mockResolvedValue({ id: "new-transaction" });
  mocks.prepare.mockResolvedValue({ transaction: "new-base64", recentBlockhash: "new-blockhash" });
});

describe("prepared payment recovery", () => {
  it("reuses a live preparation instead of creating another payment", async () => {
    mocks.inspect.mockResolvedValue("valid");
    const result = await prepareReleaseTransaction(input);
    expect(result.transactionId).toBe(oldRecord.id);
    expect(mocks.prepare).not.toHaveBeenCalled();
  });

  it("prepares again only after safe expiry", async () => {
    mocks.inspect.mockResolvedValue("expired_without_release");
    const result = await prepareReleaseTransaction(input);
    expect(mocks.transactionUpdateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: "failed", operationKey: null })
    }));
    expect(result.transactionId).toBe("new-transaction");
  });

  it("keeps the operation locked during the finality window", async () => {
    mocks.transactionFind.mockImplementation(async ({ where }: { where: { idempotencyKey?: string } }) =>
      where.idempotencyKey ? null : { ...oldRecord, updatedAt: new Date() }
    );
    mocks.inspect.mockResolvedValue("expired_without_release");
    await expect(prepareReleaseTransaction(input)).rejects.toThrow("wait for finality");
    expect(mocks.transactionUpdateMany).not.toHaveBeenCalled();
  });

  it("does not prepare again after a signature was recorded", async () => {
    mocks.transactionFind.mockImplementation(async ({ where }: { where: { idempotencyKey?: string } }) =>
      where.idempotencyKey ? null : { ...oldRecord, status: "submitted", txSig: "signature" }
    );
    await expect(prepareReleaseTransaction(input)).rejects.toThrow("resume confirmation");
    expect(mocks.inspect).not.toHaveBeenCalled();
    expect(mocks.prepare).not.toHaveBeenCalled();
  });

  it("holds a payment with ambiguous chain state for review", async () => {
    mocks.inspect.mockResolvedValue("review");
    await expect(prepareReleaseTransaction(input)).rejects.toThrow("manual review");
    expect(mocks.transactionUpdateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ requiresReviewAt: expect.any(Date) })
    }));
    expect(mocks.prepare).not.toHaveBeenCalled();
  });
});
