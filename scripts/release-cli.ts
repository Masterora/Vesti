import "dotenv/config";
import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { db } from "../lib/db";
import { ServiceError } from "../lib/services/errors";
export function releaseArgs() {
  return parseArgs({ options: {
    transaction: { type: "string" }, manifest: { type: "string" }, artifact: { type: "string" }, idl: { type: "string" }, apply: { type: "boolean", default: false },
    from: { type: "string" }, contract: { type: "string" }, approval: { type: "string" }, evidence: { type: "string" }, actor: { type: "string" }, batch: { type: "string" },
    phase: { type: "string" }, next: { type: "string" }, epoch: { type: "string" }, target: { type: "string" }, initialize: { type: "boolean", default: false },
    candidate: { type: "string" }, "candidate-approval": { type: "string" },
  }}).values;
}
export const readJson = (path: string) => JSON.parse(readFileSync(path, "utf8"));
export function cliMain(work: () => Promise<unknown>) {
  void work().then((result) => console.log(JSON.stringify(result, (_, value) => typeof value === "bigint" ? value.toString() : value, 2))).catch((error) => {
    // Never print RPC URLs, stack traces, raw signed transactions or credential paths.
    console.error(JSON.stringify({ status: "blocked", code: error instanceof ServiceError ? error.code : "RELEASE_ENVIRONMENT_BLOCKED" }));
    process.exitCode = error instanceof ServiceError && error.status === 409 ? 1 : 2;
  }).finally(() => db.$disconnect());
}
