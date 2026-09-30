export function reconciliationLimit(value = process.env.RECONCILIATION_MAX_ATTEMPTS ?? "12") {
  const limit = Number(value);
  if (!Number.isInteger(limit) || limit < 1 || limit > 1000)
    throw new Error("Invalid reconciliation maximum attempts");
  return limit;
}

export function reconciliationRetryState(attempt: number, limit: number, now = new Date()) {
  const exhausted = attempt >= limit;
  return {
    requiresReviewAt: exhausted ? now : null,
    errorCode: exhausted ? "RECONCILIATION_RETRY_LIMIT" : "RECONCILIATION_RETRY",
    errorMessage: exhausted ? "Retry limit reached; inspect chain evidence before retrying" : "Synchronization pending; retry or inspect contract chain status",
    nextAttemptAt: exhausted ? null : new Date(now.getTime() + Math.min(5000 * 2 ** Math.min(attempt - 1, 8), 900000)),
  };
}
