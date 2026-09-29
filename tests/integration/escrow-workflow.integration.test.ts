import { randomUUID } from "node:crypto";
import { Keypair } from "@solana/web3.js";
import { beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { createContract } from "@/lib/services/contracts/create-contract";
import { fundContract } from "@/lib/services/contracts/fund-contract";
import { cancelContract } from "@/lib/services/contracts/cancel-contract";
import { getContractById } from "@/lib/services/contracts/get-contract-by-id";
import { listContractsForWallet } from "@/lib/services/contracts/list-contracts-for-wallet";
import { queryWorkspace } from "@/lib/services/contracts/query-workspace";
import { claimContract } from "@/lib/services/contracts/claim-contract";
import { acceptContractClaim } from "@/lib/services/contracts/accept-contract-claim";
import { approveMilestone } from "@/lib/services/milestones/approve-milestone";
import { releaseMilestonePayment } from "@/lib/services/milestones/release-milestone-payment";
import { submitMilestoneProof } from "@/lib/services/milestones/submit-milestone-proof";
import { disputeMilestone } from "@/lib/services/milestones/dispute-milestone";
import { proposeDisputeResolution } from "@/lib/services/milestones/propose-dispute-resolution";
import { acceptDisputeResolution } from "@/lib/services/milestones/accept-dispute-resolution";
import { arbitrateDisputeResolution } from "@/lib/services/milestones/arbitrate-dispute-resolution";

const creatorWallet = "creator_integration_wallet";
const workerWallet = "worker_integration_wallet";

beforeAll(() => {
  process.env.ESCROW_ADAPTER_MODE = "mock";
});

describe("escrow workflow", () => {
  it("sorts all worker tasks before showing the first ten", async () => {
    const owner = `task_sort_creator_${randomUUID()}`;
    const worker = `task_sort_worker_${randomUUID()}`;
    for (let index = 0; index < 11; index += 1) {
      const contract = await createContract({
        creatorWallet: owner,
        workerWallet: worker,
        title: `Task sorting ${index}`,
        totalAmount: "1",
        milestones: [{ title: "Delivery", amount: "1", dueAt: index === 10 ? "2027-01-01T00:00:00.000Z" : "2027-12-01T00:00:00.000Z" }]
      });
      await fundContract({ contractId: contract.id, walletAddress: owner });
    }

    const dashboard = await queryWorkspace({ kind: "dashboard", view: "worker" }, worker);
    if (dashboard.kind !== "dashboard") throw new Error("Unexpected workspace response");
    expect(dashboard.totalTasks).toBe(11);
    expect(dashboard.tasks).toHaveLength(10);
    expect(dashboard.tasks[0].title).toBe("Task sorting 10");
  });

  it("does not expose other applicants through the selected worker's profiles", async () => {
    const owner = `profile_creator_${randomUUID()}`;
    const selected = `profile_worker_${randomUUID()}`;
    const other = `profile_other_${randomUUID()}`;
    const contract = await createContract({
      creatorWallet: owner,
      title: "Private applicant profiles",
      isPublic: true,
      totalAmount: "1",
      milestones: [{ title: "Delivery", amount: "1" }]
    });
    await claimContract({ contractId: contract.id, walletAddress: selected });
    const otherClaim = await claimContract({ contractId: contract.id, walletAddress: other });
    expect(otherClaim.applications?.map((application) => application.applicantWallet)).toEqual([other]);
    expect(otherClaim.events).toBeUndefined();
    await db.user.update({ where: { walletAddress: other }, data: { displayName: "Another applicant" } });
    await acceptContractClaim({ contractId: contract.id, walletAddress: owner, applicantWallet: selected });

    const detail = await getContractById({ contractId: contract.id, walletAddress: selected });
    expect(detail.applications).toBeUndefined();
    expect(detail.profiles?.map((profile) => profile.walletAddress)).toContain(owner);
    expect(detail.profiles?.map((profile) => profile.walletAddress)).not.toContain(other);
    expect(detail.events?.some((event) => event.actorWallet === other)).toBe(false);

    await fundContract({ contractId: contract.id, walletAddress: owner });
    const submitted = await submitMilestoneProof({
      contractId: contract.id,
      milestoneId: contract.milestones[0].id,
      walletAddress: selected,
      note: "Done"
    });
    expect(submitted.events?.some((event) => event.actorWallet === other)).toBe(false);
  });

  it("paginates public and personal contracts within their visibility scopes", async () => {
    const owner = "workspace_query_creator";
    const assignedWorker = "workspace_query_worker";
    for (const title of ["Query fixture public one", "Query fixture public two"]) {
      await createContract({
        creatorWallet: owner,
        title,
        isPublic: true,
        tags: title.endsWith("one") ? ["design"] : ["engineering"],
        totalAmount: "10",
        milestones: [{ title: "Delivery", amount: "10" }]
      });
    }
    const privateContract = await createContract({
      creatorWallet: owner,
      workerWallet: assignedWorker,
      title: "Query fixture private",
      isPublic: false,
      totalAmount: "10",
      milestones: [{ title: "Delivery", amount: "10" }]
    });

    const market = await queryWorkspace({ kind: "marketplace", q: "Query fixture", page: 1, pageSize: 1 });
    expect(market).toMatchObject({ kind: "marketplace", total: 2, page: 1, pageSize: 1 });
    if (market.kind !== "marketplace") throw new Error("Unexpected workspace response");
    expect(market.items).toHaveLength(1);
    expect(market.items[0].isPublic).toBe(true);
    const taggedMarket = await queryWorkspace({ kind: "marketplace", q: "Query fixture", tag: "design" });
    if (taggedMarket.kind !== "marketplace") throw new Error("Unexpected workspace response");
    expect(taggedMarket.total).toBe(1);
    const lastPage = await queryWorkspace({ kind: "marketplace", q: "Query fixture", page: 99, pageSize: 1 });
    if (lastPage.kind !== "marketplace") throw new Error("Unexpected workspace response");
    expect(lastPage.page).toBe(2);
    expect(lastPage.items).toHaveLength(1);

    const mine = await queryWorkspace({ kind: "contracts", q: "Query fixture", page: 2, pageSize: 2 }, owner);
    expect(mine).toMatchObject({ kind: "contracts", total: 3, page: 2, pageSize: 2 });
    if (mine.kind !== "contracts") throw new Error("Unexpected workspace response");
    expect(mine.items).toHaveLength(1);
    expect(mine.statusCounts.open).toBe(2);
    expect(mine.statusCounts.draft).toBe(1);
    const privateOnly = await queryWorkspace({ kind: "contracts", q: "Query fixture", visibility: "private" }, owner);
    if (privateOnly.kind !== "contracts") throw new Error("Unexpected workspace response");
    expect(privateOnly.total).toBe(1);

    const worker = await queryWorkspace({ kind: "contracts", relation: "working", q: "Query fixture" }, assignedWorker);
    if (worker.kind !== "contracts") throw new Error("Unexpected workspace response");
    expect(worker.total).toBe(1);
    expect(worker.items[0].title).toBe("Query fixture private");

    const dashboard = await queryWorkspace({ kind: "dashboard", view: "creator" }, owner);
    if (dashboard.kind !== "dashboard") throw new Error("Unexpected workspace response");
    expect(dashboard.relatedCount).toBe(3);
    expect(dashboard.totalTasks).toBe(1);
    expect(dashboard.tasks[0].title).toBe("Query fixture private");
    expect(dashboard.tasks[0].taskType).toBe("fund");
    await expect(queryWorkspace({ kind: "dashboard" })).rejects.toThrow("Wallet session is required");

    await db.contract.update({
      where: { id: privateContract.id },
      data: { status: "active", fundedAmount: "0", releasedAmount: "1" }
    });
    const invalidBalanceOverview = await queryWorkspace({ kind: "dashboard", view: "creator" }, owner);
    if (invalidBalanceOverview.kind !== "dashboard") throw new Error("Unexpected workspace response");
    expect(invalidBalanceOverview.escrowBalance).toBeNull();
  });

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
    const paymentOverview = await queryWorkspace({ kind: "dashboard", view: "creator" }, creatorWallet);
    if (paymentOverview.kind !== "dashboard") throw new Error("Unexpected workspace response");
    expect(paymentOverview.tasks[0].taskType).toBe("release");

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
    const creatorDisputedItem = (await listContractsForWallet({ walletAddress: creatorWallet }))
      .find((contract) => contract.id === created.id);
    expect(creatorDisputedItem?.currentMilestone?.index).toBe(2);
    expect(creatorDisputedItem?.activeDispute).toEqual({ status: "open", proposedBy: null });
    await proposeDisputeResolution({
      contractId: created.id,
      milestoneId: secondMilestone.id,
      walletAddress: creatorWallet,
      outcome: "release_to_worker"
    });
    const workerDisputedItem = (await listContractsForWallet({ walletAddress: workerWallet }))
      .find((contract) => contract.id === created.id);
    expect(workerDisputedItem?.activeDispute).toEqual({ status: "proposed", proposedBy: creatorWallet });
    const creatorOverview = await queryWorkspace({ kind: "dashboard", view: "creator" }, creatorWallet);
    const workerOverview = await queryWorkspace({ kind: "dashboard", view: "worker" }, workerWallet);
    if (creatorOverview.kind !== "dashboard" || workerOverview.kind !== "dashboard") {
      throw new Error("Unexpected workspace response");
    }
    expect(creatorOverview.totalTasks).toBe(0);
    expect(workerOverview.totalTasks).toBe(0);
    expect(workerOverview.disputeResponses.map((item) => item.id)).toContain(created.id);
    const settled = await acceptDisputeResolution({
      contractId: created.id,
      milestoneId: secondMilestone.id,
      walletAddress: workerWallet,
      idempotencyKey: randomUUID()
    });

    expect(settled.status).toBe("completed");
    expect(settled.releasedAmount).toBe("100");
    const monthlyOverview = await queryWorkspace({ kind: "dashboard", view: "worker" }, workerWallet);
    if (monthlyOverview.kind !== "dashboard") throw new Error("Unexpected workspace response");
    expect(monthlyOverview.receivedThisMonth).toBe("100");
    await db.milestone.update({ where: { id: firstMilestone.id }, data: { releasedAt: new Date("2020-01-15T00:00:00.000Z") } });
    const adjustedOverview = await queryWorkspace({ kind: "dashboard", view: "worker" }, workerWallet);
    if (adjustedOverview.kind !== "dashboard") throw new Error("Unexpected workspace response");
    expect(adjustedOverview.receivedThisMonth).toBe("40");
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
    const applicantContracts = await queryWorkspace({ kind: "contracts", q: "Public integration project" }, applicantWallet);
    if (applicantContracts.kind !== "contracts") throw new Error("Unexpected workspace response");
    expect(applicantContracts.total).toBe(0);
    const applicantOverview = await queryWorkspace({ kind: "dashboard", view: "worker" }, applicantWallet);
    if (applicantOverview.kind !== "dashboard") throw new Error("Unexpected workspace response");
    expect(applicantOverview.applications.map((item) => item.id)).toContain(created.id);
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

  it("locks the selected arbitrator before funding and allows only that wallet to decide", async () => {
    const creator = `${creatorWallet}_arb_${randomUUID()}`;
    const worker = `${workerWallet}_arb_${randomUUID()}`;
    const arbitrator = Keypair.generate().publicKey.toBase58();
    const created = await createContract({
      creatorWallet: creator,
      workerWallet: worker,
      arbitratorWallet: arbitrator,
      disputePolicy: "arbitrator",
      title: "Named arbitration",
      totalAmount: "20",
      milestones: [{ title: "Delivery", amount: "20" }]
    });
    expect(created.disputePolicy).toBe("arbitrator");
    expect(created.arbitratorWallet).toBe(arbitrator);
    const privateView = await getContractById({ contractId: created.id, walletAddress: arbitrator });
    expect(privateView.id).toBe(created.id);
    expect(privateView.applications).toBeUndefined();
    const listed = await listContractsForWallet({ walletAddress: arbitrator });
    expect(listed.some((contract) => contract.id === created.id)).toBe(true);
    const workspace = await queryWorkspace({ kind: "contracts", q: "Named arbitration" }, arbitrator);
    if (workspace.kind !== "contracts") throw new Error("Unexpected workspace response");
    expect(workspace.items.map((contract) => contract.id)).toContain(created.id);

    await fundContract({ contractId: created.id, walletAddress: creator });
    await disputeMilestone({
      contractId: created.id,
      milestoneId: created.milestones[0].id,
      walletAddress: worker,
      reason: "Needs independent decision"
    });
    await expect(arbitrateDisputeResolution({
      contractId: created.id,
      milestoneId: created.milestones[0].id,
      walletAddress: creator,
      outcome: "release_to_worker"
    })).rejects.toThrow();
    const resolved = await arbitrateDisputeResolution({
      contractId: created.id,
      milestoneId: created.milestones[0].id,
      walletAddress: arbitrator,
      outcome: "release_to_worker",
      idempotencyKey: randomUUID()
    });
    expect(resolved.status).toBe("completed");
    expect(resolved.releasedAmount).toBe("20");
    expect(resolved.disputes?.[0].proposedBy).toBeNull();
    expect(resolved.events).toBeUndefined();

    const refund = await createContract({
      creatorWallet: creator,
      workerWallet: worker,
      arbitratorWallet: arbitrator,
      disputePolicy: "arbitrator",
      title: "Arbitrated refund",
      totalAmount: "10",
      milestones: [{ title: "Delivery", amount: "10" }]
    });
    await fundContract({ contractId: refund.id, walletAddress: creator });
    await disputeMilestone({
      contractId: refund.id,
      milestoneId: refund.milestones[0].id,
      walletAddress: creator,
      reason: "Needs refund"
    });
    const refunded = await arbitrateDisputeResolution({
      contractId: refund.id,
      milestoneId: refund.milestones[0].id,
      walletAddress: arbitrator,
      outcome: "refund_to_creator",
      idempotencyKey: randomUUID()
    });
    expect(refunded.status).toBe("cancelled");
    expect(refunded.refundedAmount).toBe("10");
  });

  it("hides applicant identities from the arbitrator in lists, details, and settlement responses", async () => {
    const creator = `privacy_creator_${randomUUID()}`;
    const selected = `privacy_selected_${randomUUID()}`;
    const other = `privacy_other_${randomUUID()}`;
    const arbitrator = Keypair.generate().publicKey.toBase58();
    const created = await createContract({
      creatorWallet: creator,
      disputePolicy: "arbitrator",
      arbitratorWallet: arbitrator,
      title: "Applicant privacy under arbitration",
      isPublic: true,
      totalAmount: "10",
      milestones: [{ title: "Delivery", amount: "10" }]
    });
    await claimContract({ contractId: created.id, walletAddress: selected });
    await claimContract({ contractId: created.id, walletAddress: other });
    await db.user.update({ where: { walletAddress: other }, data: { displayName: "Hidden applicant" } });

    const workspace = await queryWorkspace({ kind: "contracts", q: created.title }, arbitrator);
    if (workspace.kind !== "contracts") throw new Error("Unexpected workspace response");
    expect(workspace.items.map((contract) => contract.id)).toContain(created.id);
    const item = workspace.items.find((contract) => contract.id === created.id)!;
    expect(item.requestedWorkerWallet).toBeNull();
    expect(item.pendingApplicantWallets).toEqual([]);
    expect(item.profiles?.some((profile) => profile.walletAddress === other)).toBe(false);

    const beforeSelection = await getContractById({ contractId: created.id, walletAddress: arbitrator });
    expect(beforeSelection.requestedWorkerWallet).toBeNull();
    expect(beforeSelection.applications).toBeUndefined();
    expect(beforeSelection.events).toBeUndefined();
    expect(beforeSelection.profiles?.some((profile) => profile.walletAddress === other)).toBe(false);
    expect(JSON.stringify(beforeSelection)).not.toContain(other);

    await acceptContractClaim({ contractId: created.id, walletAddress: creator, applicantWallet: selected });
    await fundContract({ contractId: created.id, walletAddress: creator });
    await disputeMilestone({
      contractId: created.id,
      milestoneId: created.milestones[0].id,
      walletAddress: selected,
      reason: "Needs arbitration"
    });
    const idempotencyKey = randomUUID();
    const resolved = await arbitrateDisputeResolution({
      contractId: created.id,
      milestoneId: created.milestones[0].id,
      walletAddress: arbitrator,
      outcome: "release_to_worker",
      idempotencyKey
    });
    expect(resolved.status).toBe("completed");
    expect(resolved.events).toBeUndefined();
    expect(resolved.profiles?.some((profile) => profile.walletAddress === other)).toBe(false);
    expect(JSON.stringify(resolved)).not.toContain(other);

    const repeated = await arbitrateDisputeResolution({
      contractId: created.id,
      milestoneId: created.milestones[0].id,
      walletAddress: arbitrator,
      outcome: "release_to_worker",
      idempotencyKey
    });
    expect(repeated.events).toBeUndefined();
    expect(JSON.stringify(repeated)).not.toContain(other);
  });
});
