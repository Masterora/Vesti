import { randomUUID } from "node:crypto";
import { describe, it, expect } from "vitest";
import { db } from "@/lib/db";
import { createContract } from "@/lib/services/contracts/create-contract";
import { submitMilestoneProof } from "@/lib/services/milestones/submit-milestone-proof";
import { approveMilestone } from "@/lib/services/milestones/approve-milestone";
import { recoverChainOperation } from "@/lib/services/transactions/chain-operations";
import { submitEscrowTransaction } from "@/lib/services/transactions/submit-escrow-transaction";

describe("contract operation isolation", () => {
  it("blocks proof and approval while a chain dispute build owns the contract", async () => {
    const creator = `creator_${randomUUID()}`,
      worker = `worker_${randomUUID()}`;
    const contract = await createContract({
      creatorWallet: creator,
      workerWallet: worker,
      title: "Pending dispute",
      totalAmount: "10",
      milestones: [{ title: "Delivery", amount: "10" }],
    });
    const mid = contract.milestones[0].id;
    await db.contract.update({
      where: { id: contract.id },
      data: { status: "active", chainSyncStatus: "synced", fundedAmount: "10" },
    });
    await db.milestone.update({
      where: { id: mid },
      data: { status: "ready" },
    });
    const operation = await db.escrowTransaction.create({
      data: {
        contractId: contract.id,
        milestoneId: mid,
        kind: "dispute_open",
        action: "dispute",
        mode: "onchain",
        walletAddress: creator,
        idempotencyKey: randomUUID(),
        status: "building",
        contractLockKey: contract.id,
        contextVersion: 1,
        buildToken: randomUUID(),
        buildExpiresAt: new Date(0),
      },
    });
    const previous = process.env.ESCROW_ADAPTER_MODE;
    process.env.ESCROW_ADAPTER_MODE = "onchain";
    try {
      await expect(
        submitMilestoneProof({
          contractId: contract.id,
          milestoneId: mid,
          walletAddress: worker,
          note: "Late proof",
        }),
      ).rejects.toThrow("pending");
      await expect(
        approveMilestone({
          contractId: contract.id,
          milestoneId: mid,
          walletAddress: creator,
        }),
      ).rejects.toThrow("pending");
      expect(
        await db.proofSubmission.count({ where: { milestoneId: mid } }),
      ).toBe(0);
      await recoverChainOperation(operation.id);
      expect(
        (
          await db.escrowTransaction.findUniqueOrThrow({
            where: { id: operation.id },
          })
        ).status,
      ).toBe("failed");
      const late = await db.escrowTransaction.updateMany({
        where: {
          id: operation.id,
          status: "building",
          buildToken: operation.buildToken,
        },
        data: { status: "prepared", preparedTransaction: "late-message" },
      });
      expect(late.count).toBe(0);
      await submitMilestoneProof({
        contractId: contract.id,
        milestoneId: mid,
        walletAddress: worker,
        note: "New proof",
      });
      expect(
        (await db.milestone.findUniqueOrThrow({ where: { id: mid } })).status,
      ).toBe("submitted");
      expect(
        (await db.contract.findUniqueOrThrow({ where: { id: contract.id } }))
          .businessRevision,
      ).toBe(BigInt(1));
    } finally {
      process.env.ESCROW_ADAPTER_MODE = previous;
    }
  });
  it("rejects client-only signatures before signed bytes have been persisted", async () => {
    const creator = `creator_${randomUUID()}`;
    const contract = await createContract({
      creatorWallet: creator,
      workerWallet: `worker_${randomUUID()}`,
      title: "Unsigned",
      totalAmount: "10",
      milestones: [{ title: "Delivery", amount: "10" }],
    });
    const operation = await db.escrowTransaction.create({
      data: {
        contractId: contract.id,
        kind: "fund",
        action: "fund",
        mode: "onchain",
        walletAddress: creator,
        idempotencyKey: randomUUID(),
        contextVersion: 1,
        status: "prepared",
      },
    });
    await expect(
      submitEscrowTransaction({
        contractId: contract.id,
        transactionId: operation.id,
        walletAddress: creator,
        txSig: "untrusted-client-signature",
      }),
    ).rejects.toThrow("Persist the signed");
    expect(
      (
        await db.escrowTransaction.findUniqueOrThrow({
          where: { id: operation.id },
        })
      ).txSig,
    ).toBeNull();
  });
});
