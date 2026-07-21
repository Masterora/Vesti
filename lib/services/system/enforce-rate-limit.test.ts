import { describe, expect, it } from "vitest";
import { getRateLimitWindow } from "./enforce-rate-limit";

describe("rate limit windows", () => {
  it("uses deterministic fixed windows and retains expired buckets for cleanup", () => {
    const result = getRateLimitWindow(new Date("2026-07-21T01:02:34.567Z"), 60_000);

    expect(result.windowStart.toISOString()).toBe("2026-07-21T01:02:00.000Z");
    expect(result.expiresAt.toISOString()).toBe("2026-07-21T01:04:00.000Z");
  });
});
