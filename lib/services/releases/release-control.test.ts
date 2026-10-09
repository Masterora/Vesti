import { describe, it, expect, vi, afterEach } from "vitest";
import type { ChainReleaseControl } from "@prisma/client";
import { assertReleasePermission } from "./release-control";
const control: ChainReleaseControl = { environmentKey: "env", genesisHash: "g", programId: "p", mint: "m", phase: "open", epoch: 7n, activeManifestSha256: "active", targetManifestSha256: "target", deploymentCandidateSha256: null, deploymentCandidateEvidence: null, deploymentReceiptEvidence: null, maintenanceBatch: null, actor: "operator", drainEvidence: null, updatedAt: new Date() };
afterEach(() => vi.unstubAllEnvs());
describe("persistent release permission", () => {
  it("allows identity-bound status reads throughout maintenance without granting writes", () => {
    vi.stubEnv("ESCROW_CHAIN_NEW_OPERATIONS_ENABLED", "false");
    for (const phase of ["open", "draining", "frozen", "deploying", "rebinding"]) {
      const row = { ...control, phase }, manifest = phase === "rebinding" ? "target" : "active";
      expect(assertReleasePermission(row, "status", manifest).phase).toBe(phase);
      expect(() => assertReleasePermission(row, "prepare", manifest)).toThrow();
      expect(() => assertReleasePermission(row, "status", "wrong")).toThrow("invalid");
    }
    expect(() => assertReleasePermission(null, "status", "active")).toThrow("invalid");
  });
  it("fails closed without a row, with an old manifest or stale epoch", () => {
    vi.stubEnv("ESCROW_CHAIN_NEW_OPERATIONS_ENABLED", "true");
    expect(() => assertReleasePermission(null, "prepare", "active")).toThrow("invalid");
    expect(() => assertReleasePermission(control, "prepare", "old")).toThrow("invalid");
    expect(() => assertReleasePermission(control, "prepare", "active", 6n)).toThrow("paused");
  });
  it("keeps original recovery in draining and pauses all writes in frozen", () => {
    vi.stubEnv("ESCROW_CHAIN_NEW_OPERATIONS_ENABLED", "false");
    expect(() => assertReleasePermission(control, "prepare", "active")).toThrow("paused");
    expect(assertReleasePermission({ ...control, phase: "draining" }, "recover", "active").epoch).toBe(7n);
    expect(() => assertReleasePermission({ ...control, phase: "frozen" }, "recover", "active")).toThrow("paused");
    expect(assertReleasePermission({ ...control, phase: "rebinding" }, "transition", "target").phase).toBe("rebinding");
  });
});
