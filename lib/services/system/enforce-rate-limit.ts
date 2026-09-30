import { createHash } from "node:crypto";
import { db } from "@/lib/db";
import { ServiceError } from "@/lib/services/errors";

export type RateLimitPolicy = {
  scope: string;
  identity: string;
  limit: number;
  windowMs: number;
  now?: Date;
};

export function getRateLimitWindow(now: Date, windowMs: number) {
  if (!Number.isInteger(windowMs) || windowMs <= 0) {
    throw new Error("Rate limit window must be a positive integer");
  }

  const windowStartMs = Math.floor(now.getTime() / windowMs) * windowMs;

  return {
    windowStart: new Date(windowStartMs),
    expiresAt: new Date(windowStartMs + windowMs * 2)
  };
}

export async function enforceRateLimit(policy: RateLimitPolicy, client: Pick<typeof db, "apiRateLimitBucket"> = db) {
  if (!Number.isInteger(policy.limit) || policy.limit <= 0) {
    throw new Error("Rate limit must be a positive integer");
  }

  const now = policy.now ?? new Date();
  const { windowStart, expiresAt } = getRateLimitWindow(now, policy.windowMs);
  const bucketKey = createHash("sha256")
    .update(`${policy.scope}:${policy.identity.trim().toLowerCase()}`)
    .digest("hex");
  const bucket = await client.apiRateLimitBucket.upsert({
    where: {
      bucketKey_windowStart: {
        bucketKey,
        windowStart
      }
    },
    create: {
      bucketKey,
      windowStart,
      expiresAt
    },
    update: {
      requestCount: { increment: 1 },
      expiresAt
    },
    select: { requestCount: true }
  });

  if (bucket.requestCount > policy.limit) {
    throw new ServiceError("Too many requests. Please try again later.", 429);
  }
}
