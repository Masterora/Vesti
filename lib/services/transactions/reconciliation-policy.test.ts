import { describe, expect, it } from "vitest";
import { reconciliationLimit, reconciliationRetryState } from "./reconciliation-policy";
describe("bounded reconciliation", () => {
  it("rejects invalid limits and stops scheduling at the configured boundary", () => {
    for (const value of ["0", "-1", "1.5", "NaN", "1001"]) expect(() => reconciliationLimit(value)).toThrow();
    const now = new Date();
    expect(reconciliationRetryState(11, 12, now).requiresReviewAt).toBeNull();
    expect(reconciliationRetryState(12, 12, now)).toMatchObject({ requiresReviewAt: now, nextAttemptAt: null, errorCode: "RECONCILIATION_RETRY_LIMIT" });
    expect(reconciliationRetryState(12, 12, now)).not.toHaveProperty("status");
    expect(reconciliationRetryState(12, 12, now)).not.toHaveProperty("contractLockKey");
  });
});
