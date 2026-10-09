import { describe, it, expect, afterEach } from "vitest";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { db } from "../../lib/db";
import { initializeTestRelease } from "../release-fixture";
import { lockReleaseControl, changeReleasePhase } from "../../lib/services/releases/release-control";
import { prepareChainOperation } from "../../lib/services/transactions/chain-operations";
import { updateContractVisibility } from "../../lib/services/contracts/update-contract-visibility";
const original = { ...process.env };
afterEach(() => { process.env = { ...original }; });
describe("maintenance across independent DB clients", () => {
  it("returns the committed business revision when changing visibility", async () => {
    process.env.ESCROW_ADAPTER_MODE = "mock";
    const creator = `c-${randomUUID()}`;
    await db.user.create({ data: { walletAddress: creator } });
    const contract = await db.contract.create({ data: { displayId: randomUUID(), creatorWallet: creator, title: "visibility", totalAmount: 1, businessRevision: 9n } });
    const result = await updateContractVisibility({ contractId: contract.id, walletAddress: creator, isPublic: true });
    const stored = await db.contract.findUniqueOrThrow({ where: { id: contract.id } });
    expect(result.businessRevision).toBe("10"); expect(result.businessRevision).toBe(stored.businessRevision.toString());
    expect(result.isPublic).toBe(true); expect(stored.isPublic).toBe(true);
  });
  it("returns status without signing bytes during maintenance and preserves retry isolation", async () => {
    const release = await initializeTestRelease({ releaseId: `retry-${randomUUID()}` });
    process.env.ESCROW_ADAPTER_MODE = "onchain";
    const creator = `c-${randomUUID()}`;
    await db.user.create({ data: { walletAddress: creator } });
    const contract = await db.contract.create({ data: { displayId: randomUUID(), creatorWallet: creator, title: "retry", totalAmount: 1 } });
    const operation = await db.escrowTransaction.create({ data: { contractId: contract.id, action: "fund", kind: "fund", mode: "onchain", walletAddress: creator, idempotencyKey: randomUUID(), status: "prepared", contractLockKey: contract.id, preparedTransaction: "original-message", operationContext: {} } });
    const input = { contractId: contract.id, walletAddress: creator, idempotencyKey: operation.idempotencyKey!, kind: "fund" as const };
    expect((await prepareChainOperation(input)).transaction).toBe("original-message");
    await changeReleasePhase({ expectedPhase: "open", expectedEpoch: 0n, nextPhase: "draining", actor: "operator", batch: "b" });
    for (const phase of ["draining", "frozen", "deploying", "rebinding"]) {
      await db.chainReleaseControl.update({ where: { environmentKey: release.environmentKey }, data: { phase, targetManifestSha256: phase === "rebinding" ? release.manifestSha256 : null } });
      const retry = await prepareChainOperation(input);
      expect(retry.transactionId).toBe(operation.id); expect(retry.status).toBe("prepared"); expect(retry.transaction).toBeNull();
      await expect(prepareChainOperation({ ...input, idempotencyKey: randomUUID() })).rejects.toThrow("paused");
      await expect(prepareChainOperation({ ...input, walletAddress: "another-wallet" })).rejects.toThrow("another wallet");
      await expect(prepareChainOperation({ ...input, reason: "changed" })).rejects.toThrow("parameters changed");
    }
    expect(await db.escrowTransaction.findUniqueOrThrow({ where: { id: operation.id } })).toEqual(operation);
    await db.chainReleaseControl.delete({ where: { environmentKey: release.environmentKey } });
    await expect(prepareChainOperation(input)).rejects.toThrow("invalid");
  });
  it("waits for admitted writes, increments epoch and rejects late prepared publication", async () => {
    const release = await initializeTestRelease({ releaseId: `race-${randomUUID()}` });
    const second = new PrismaClient();
    let entered!: () => void, finish!: () => void;
    const admitted = new Promise<void>((resolve) => { entered = resolve; });
    const barrier = new Promise<void>((resolve) => { finish = resolve; });
    const first = db.$transaction(async (tx) => {
      const control = await lockReleaseControl(tx, "prepare");
      entered(); await barrier; return control.epoch;
    }, { timeout: 10000 });
    await admitted;
    let maintenanceCommitted = false;
    const maintenance = second.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "environmentKey" FROM "ChainReleaseControl" WHERE "environmentKey" = ${release.environmentKey} FOR UPDATE`;
      await tx.chainReleaseControl.update({ where: { environmentKey: release.environmentKey }, data: { phase: "draining", epoch: { increment: 1 } } });
    }).then(() => { maintenanceCommitted = true; });
    // pg_locks demonstrates actual contention, without relying on a sleep duration.
    let lockWaitObserved = false;
    for (let n = 0; n < 100; n++) {
      const rows = await db.$queryRaw<{ count: bigint }[]>`SELECT count(*) FROM pg_stat_activity WHERE wait_event_type = 'Lock' AND query LIKE '%ChainReleaseControl%'`;
      if (rows[0].count > 0n) { lockWaitObserved = true; break; }
    }
    expect(lockWaitObserved).toBe(true); expect(maintenanceCommitted).toBe(false);
    finish(); const epoch = await first; await maintenance;
    await expect(db.$transaction((tx) => lockReleaseControl(tx, "prepare", epoch))).rejects.toThrow("paused");
    await expect(db.$transaction((tx) => lockReleaseControl(tx, "recover", epoch))).rejects.toThrow("paused");
    expect((await db.$transaction((tx) => lockReleaseControl(tx, "recover"))).epoch).toBe(epoch + 1n);
    await second.$disconnect();
  });
  it("does not admit a missing row or cancel prepared transactions on draining", async () => {
    const release = await initializeTestRelease({ releaseId: `drain-${randomUUID()}` });
    const creator = `c-${randomUUID()}`;
    await db.user.create({ data: { walletAddress: creator } });
    const contract = await db.contract.create({ data: { displayId: randomUUID(), creatorWallet: creator, title: "prepared lock", totalAmount: 1 } });
    const operation = await db.escrowTransaction.create({ data: { contractId: contract.id, action: "fund", kind: "fund", mode: "onchain", walletAddress: creator, idempotencyKey: randomUUID(), status: "prepared", contractLockKey: contract.id, preparedTransaction: "externally-published-message" } });
    await changeReleasePhase({ expectedPhase: "open", expectedEpoch: 0n, nextPhase: "draining", actor: "operator", batch: "b" });
    expect((await db.escrowTransaction.findUniqueOrThrow({ where: { id: operation.id } })).status).toBe("prepared");
    await db.chainReleaseControl.delete({ where: { environmentKey: release.environmentKey } });
    await expect(db.$transaction((tx) => lockReleaseControl(tx, "recover"))).rejects.toThrow("invalid");
  });
});
