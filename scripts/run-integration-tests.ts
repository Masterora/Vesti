import "dotenv/config";
import { spawnSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";

const sourceDatabaseUrl = process.env.DATABASE_URL;
const testSchema = "vesti_integration_test";

if (!sourceDatabaseUrl) {
  throw new Error("DATABASE_URL is required for integration tests");
}

const testDatabaseUrl = new URL(sourceDatabaseUrl);
testDatabaseUrl.searchParams.set("schema", testSchema);
const environment = {
  ...process.env,
  DATABASE_URL: testDatabaseUrl.toString(),
  ESCROW_ADAPTER_MODE: "mock",
  DEMO_WALLET_AUTH_ENABLED: "true"
};

function run(command: string, args: string[]) {
  const isWindows = process.platform === "win32";
  const executable = isWindows ? process.env.ComSpec ?? "cmd.exe" : command;
  const executableArgs = isWindows
    ? ["/d", "/s", "/c", [command, ...args].join(" ")]
    : args;
  const result = spawnSync(executable, executableArgs, {
    cwd: process.cwd(),
    env: environment,
    stdio: "inherit"
  });

  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed with exit code ${result.status ?? "unknown"}`);
  }
}

async function dropTestSchema() {
  const db = new PrismaClient({ datasourceUrl: testDatabaseUrl.toString() });
  try {
    await db.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${testSchema}" CASCADE`);
  } finally {
    await db.$disconnect();
  }
}

async function main() {
  await dropTestSchema();
  try {
    run("corepack", ["pnpm", "prisma", "migrate", "deploy"]);
    run("corepack", ["pnpm", "exec", "vitest", "run", "--config", "vitest.integration.config.ts"]);
  } finally {
    await dropTestSchema();
  }
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
