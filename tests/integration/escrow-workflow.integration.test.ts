import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { createContract } from "@/lib/services/contracts/create-contract";
import { fundContract } from "@/lib/services/contracts/fund-contract";
import { cancelContract } from "@/lib/services/contracts/cancel-contract";
import { getContractById } from "@/lib/services/contracts/get-contract-by-id";
import { claimContract } from "@/lib/services/contracts/claim-contract";
import { approveMilestone } from "@/lib/services/milestones/approve-milestone";
import { releaseMilestonePayment } from "@/lib/services/milestones/release-milestone-payment";
import { submitMilestoneProof } from "@/lib/services/milestones/submit-milestone-proof";
import { disputeMilestone } from "@/lib/services/milestones/dispute-milestone";
import { proposeDisputeResolution } from "@/lib/services/milestones/propose-dispute-resolution";
import { acceptDisputeResolution } from "@/lib/services/milestones/accept-dispute-resolution";

const creatorWallet = "creator_integration_wallet";
const workerWallet = "worker_integration_wallet";

beforeAll(() => {
  process.env.ESCROW_ADAPTER_MODE = "mock";
});

describe("escrow workflow", () => {
  it("keeps funding and release idempotent and supports bilateral dispute settlement", async () => {
    const created = await createContract({
      creatorWallet,
      workerWallet,
      title: "Integration escrow",
      totalAmount: "100",
      milestones: [
        { title: "Delivery", amount: "60" },
        { title: "Handoff", amount: "40" }
      ]
    });
    const fundingKey = randomUUID();

    await fundContract({
      contractId: created.id,
      walletAddress: creatorWallet,
      idempotencyKey: fundingKey
    });
    await fundContract({
      contractId: created.id,
      walletAddress: creatorWallet,
      idempotencyKey: fundingKey
    });

    const firstMilestone = created.milestones[0];
    await submitMilestoneProof({
      contractId: created.id,
      milestoneId: firstMilestone.id,
      walletAddress: workerWallet,
      note: "Delivered"
    });
    await approveMilestone({
      contractId: created.id,
      milestoneId: firstMilestone.id,
      walletAddress: creatorWallet
    });

    const releaseKey = randomUUID();
    await releaseMilestonePayment({
      contractId: created.id,
      milestoneId: firstMilestone.id,
      walletAddress: creatorWallet,
      idempotencyKey: releaseKey
    });
    await releaseMilestonePayment({
      contractId: created.id,
      milestoneId: firstMilestone.id,
      walletAddress: creatorWallet,
      idempotencyKey: releaseKey
    });

    const secondMilestone = created.milestones[1];
    await disputeMilestone({
      contractId: created.id,
      milestoneId: secondMilestone.id,
      walletAddress: creatorWallet,
      reason: "Need a bilateral settlement"
    });
    await proposeDisputeResolution({
      contractId: created.id,
      milestoneId: secondMilestone.id,
      walletAddress: creatorWallet,
      outcome: "release_to_worker"
    });
    const settled = await acceptDisputeResolution({
      contractId: created.id,
      milestoneId: secondMilestone.id,
      walletAddress: workerWallet,
      idempotencyKey: randomUUID()
    });

    expect(settled.status).toBe("completed");
    expect(settled.releasedAmount).toBe("100");
    expect(
      await db.event.count({ where: { contractId: created.id, eventType: "contract_funded" } })
    ).toBe(1);
    expect(
      await db.event.count({
        where: { contractId: created.id, milestoneId: firstMilestone.id, eventType: "milestone_released" }
      })
    ).toBe(1);
    expect(await db.escrowTransaction.count({ where: { contractId: created.id } })).toBe(3);
  });

  it("rejects cancelling an open project and hides participant-only data from viewers", async () => {
    const created = await createContract({
      creatorWallet: `${creatorWallet}_public`,
      title: "Public integration project",
      isPublic: true,
      totalAmount: "10",
      milestones: [{ title: "Public milestone", amount: "10" }]
    });

    await expect(
      cancelContract({
        contractId: created.id,
        walletAddress: `${creatorWallet}_public`
      })
    ).rejects.toThrow("Only draft contracts can be cancelled");

    const viewerContract = await getContractById({ contractId: created.id });
    expect(viewerContract.events).toBeUndefined();
    expect(viewerContract.comments).toBeUndefined();
    expect(viewerContract.applications).toBeUndefined();
    expect(viewerContract.milestones[0].proofSubmissions).toBeUndefined();

    const applicantWallet = "applicant_integration_wallet";
    await claimContract({ contractId: created.id, walletAddress: applicantWallet });
    const applicantContract = await getContractById({
      contractId: created.id,
      walletAddress: applicantWallet
    });
    expect(applicantContract.applications).toHaveLength(1);
    expect(applicantContract.applications?.[0].applicantWallet).toBe(applicantWallet);
    expect(applicantContract.events).toBeUndefined();
  });

  it("allows only one concurrent release for a milestone", async () => {
    const created = await createContract({
      creatorWallet: `${creatorWallet}_concurrent`,
      workerWallet: `${workerWallet}_concurrent`,
      title: "Concurrent release",
      totalAmount: "25",
      milestones: [{ title: "Only milestone", amount: "25" }]
    });
    const milestone = created.milestones[0];

    await fundContract({
      contractId: created.id,
      walletAddress: `${creatorWallet}_concurrent`,
      idempotencyKey: randomUUID()
    });
    await submitMilestoneProof({
      contractId: created.id,
      milestoneId: milestone.id,
      walletAddress: `${workerWallet}_concurrent`,
      note: "Delivered"
    });
    await approveMilestone({
      contractId: created.id,
      milestoneId: milestone.id,
      walletAddress: `${creatorWallet}_concurrent`
    });

    const results = await Promise.allSettled([
      releaseMilestonePayment({
        contractId: created.id,
        milestoneId: milestone.id,
        walletAddress: `${creatorWallet}_concurrent`,
        idempotencyKey: randomUUID()
      }),
      releaseMilestonePayment({
        contractId: created.id,
        milestoneId: milestone.id,
        walletAddress: `${creatorWallet}_concurrent`,
        idempotencyKey: randomUUID()
      })
    ]);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(
      await db.event.count({
        where: { contractId: created.id, milestoneId: milestone.id, eventType: "milestone_released" }
      })
    ).toBe(1);
    expect((await db.contract.findUniqueOrThrow({ where: { id: created.id } })).releasedAmount.toString()).toBe(
      "25"
    );
  });

  it("records the remaining balance when both participants accept a refund", async () => {
    const refundCreator = `${creatorWallet}_refund`;
    const refundWorker = `${workerWallet}_refund`;
    const created = await createContract({
      creatorWallet: refundCreator,
      workerWallet: refundWorker,
      title: "Refund settlement",
      totalAmount: "15",
      milestones: [{ title: "Refund milestone", amount: "15" }]
    });
    const milestone = created.milestones[0];

    await fundContract({
      contractId: created.id,
      walletAddress: refundCreator,
      idempotencyKey: randomUUID()
    });
    await disputeMilestone({
      contractId: created.id,
      milestoneId: milestone.id,
      walletAddress: refundWorker,
      reason: "Mutual refund"
    });
    await proposeDisputeResolution({
      contractId: created.id,
      milestoneId: milestone.id,
      walletAddress: refundWorker,
      outcome: "refund_to_creator"
    });
    const refunded = await acceptDisputeResolution({
      contractId: created.id,
      milestoneId: milestone.id,
      walletAddress: refundCreator,
      idempotencyKey: randomUUID()
    });

    expect(refunded.status).toBe("cancelled");
    expect(refunded.refundedAmount).toBe("15");
  });
});
