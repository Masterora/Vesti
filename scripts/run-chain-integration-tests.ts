import "dotenv/config";
import { spawn } from "node:child_process";
import { PrismaClient } from "@prisma/client";
const source = process.env.DATABASE_URL;
if (!source) throw new Error("DATABASE_URL is required");
const url = new URL(source);
url.searchParams.set("schema", "vesti_chain_integration_test");
const environment = {
  ...process.env,
  DATABASE_URL: url.toString(),
  VESTI_WEB_CHAIN_TEST: "1",
  ESCROW_ADAPTER_MODE: "onchain",
};
const db = new PrismaClient({ datasourceUrl: url.toString() });
async function run(command: string, args: string[]) {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, { env: environment, stdio: "inherit" });
    child.on("exit", (code) =>
      code === 0 ? resolve() : reject(new Error(`${command} failed: ${code}`)),
    );
    child.on("error", reject);
  });
}
async function main() {
  await db.$executeRawUnsafe(
    'DROP SCHEMA IF EXISTS "vesti_chain_integration_test" CASCADE',
  );
  try {
    await run("corepack", ["pnpm", "prisma", "migrate", "deploy"]);
    await run("bash", ["scripts/test-onchain.sh"]);
  } finally {
    await db.$executeRawUnsafe(
      'DROP SCHEMA IF EXISTS "vesti_chain_integration_test" CASCADE',
    );
    await db.$disconnect();
  }
}
void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
