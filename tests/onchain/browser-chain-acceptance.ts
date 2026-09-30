import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { createPrivateKey, sign } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "playwright";
import { Keypair, Transaction, type Connection } from "@solana/web3.js";
import { db } from "../../lib/db";
import { createContract } from "../../lib/services/contracts/create-contract";
import {
  prepareChainOperation,
  recordSignedOperation,
  recoverChainOperation,
} from "../../lib/services/transactions/chain-operations";
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
async function waitFor(test: () => Promise<boolean>, label: string) {
  for (let n = 0; n < 100; n++) {
    if (await test()) return;
    await delay(500);
  }
  throw new Error(`Timed out: ${label}`);
}

export async function runBrowserAcceptance(
  connection: Connection,
  creator: Keypair,
  worker: Keypair,
  arbitrator: Keypair,
) {
  const port = Number(process.env.VESTI_BROWSER_TEST_PORT ?? 18990),
    url = `http://127.0.0.1:${port}`;
  const env = {
    ...process.env,
    NEXT_PUBLIC_APP_URL: url,
    AUTH_SECRET: "vesti-isolated-browser-tests-only-secret",
    NODE_ENV: "development" as const,
  };
  const startServer = () =>
    spawn("corepack", ["pnpm", "exec", "next", "dev", "--port", String(port)], {
      env,
      stdio: ["ignore", "pipe", "pipe"],
      detached: process.platform !== "win32",
    });
  let serverOutput = "";
  const attachLogs = (child: ChildProcess) => {
    child.stdout?.on("data", (b) => {
      serverOutput += b.toString();
    });
    child.stderr?.on("data", (b) => {
      serverOutput += b.toString();
    });
  };
  let server: ChildProcess = startServer();
  attachLogs(server);
  const stopServer = async () => {
    if (server.pid) {
      const stopped = new Promise<void>((resolve) =>
        server.once("exit", () => resolve()),
      );
      if (process.platform !== "win32") process.kill(-server.pid, "SIGTERM");
      else server.kill();
      await stopped;
    }
  };
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.VESTI_BROWSER_EXECUTABLE,
  });
  const output = "output/iteration-2";
  const evidence: unknown[] = [];
  let workerStorage:
    | Awaited<ReturnType<import("playwright").BrowserContext["storageState"]>>
    | undefined;
  await mkdir(output, { recursive: true });
  try {
    await waitFor(async () => {
      try {
        return (
          await fetch(`${url}/api/health`, {
            method: "POST",
            headers: { origin: url },
          })
        ).ok;
      } catch {
        return false;
      }
    }, "Web server");
    const runtime = await fetch(`${url}/api/runtime/public-config`, {
      method: "POST",
      headers: { origin: url, "Content-Type": "application/json" },
      body: "{}",
    });
    assert.equal((await runtime.json()).data.canOpenDispute, true);
    for (const policy of ["bilateral", "arbitrator"] as const)
      for (const outcome of [
        "release_to_worker",
        "refund_to_creator",
      ] as const) {
        const contract = await createContract({
          creatorWallet: creator.publicKey.toBase58(),
          workerWallet: worker.publicKey.toBase58(),
          disputePolicy: policy,
          arbitratorWallet:
            policy === "arbitrator"
              ? arbitrator.publicKey.toBase58()
              : undefined,
          title: `Browser ${policy} ${outcome}`,
          totalAmount: "10",
          milestones: [{ title: "Browser delivery", amount: "10" }],
        });
        // Funding is exercised by the same API protocol; all dispute actions below originate from page buttons.
        const prepared = await prepareChainOperation({
          contractId: contract.id,
          kind: "fund",
          walletAddress: creator.publicKey.toBase58(),
          idempotencyKey: crypto.randomUUID(),
        });
        const tx = Transaction.from(
          Buffer.from(prepared.transaction!, "base64"),
        );
        tx.sign(creator);
        const signed = await recordSignedOperation({
          transactionId: prepared.transactionId!,
          walletAddress: creator.publicKey.toBase58(),
          signedTransaction: tx.serialize().toString("base64"),
        });
        await connection.sendRawTransaction(tx.serialize());
        await waitFor(
          async () =>
            (await connection.getSignatureStatuses([signed.txSig!])).value[0]
              ?.confirmationStatus === "finalized",
          "Funding finality",
        );
        await recoverChainOperation(prepared.transactionId!);
        let actor = worker;
        const hasInitialSession = Boolean(workerStorage);
        const context = await browser.newContext({
            viewport: { width: 1280, height: 900 },
            storageState: workerStorage,
          }),
          page = await context.newPage();
        const errors: string[] = [];
        page.on("pageerror", (error) => errors.push(error.message));
        await page.exposeFunction("testWalletAddress", () =>
          actor.publicKey.toBase58(),
        );
        await page.exposeFunction("testSignMessage", (bytes: number[]) => {
          const key = createPrivateKey({
            key: Buffer.concat([
              Buffer.from("302e020100300506032b657004220420", "hex"),
              Buffer.from(actor.secretKey.subarray(0, 32)),
            ]),
            format: "der",
            type: "pkcs8",
          });
          return [...sign(null, Buffer.from(bytes), key)];
        });
        await page.exposeFunction("testSignTransaction", (bytes: number[]) => {
          const transaction = Transaction.from(Buffer.from(bytes));
          transaction.sign(actor);
          return [...transaction.serialize()];
        });
        await page.addInitScript(() => {
          // tsx keepNames adds this helper when Playwright serializes the callback.
          new Function("window.__name = (value) => value")();
          const win = window as unknown as {
            solana: unknown;
            testWalletAddress: () => Promise<string>;
            testSignMessage: (bytes: number[]) => Promise<number[]>;
            testSignTransaction: (bytes: number[]) => Promise<number[]>;
          };
          const provider = {
            isPhantom: true,
            isConnected: false,
            publicKey: null as { toBase58: () => string } | null,
            async connect() {
              const address = await win.testWalletAddress();
              this.publicKey = { toBase58: () => address };
              this.isConnected = true;
              return { publicKey: this.publicKey };
            },
            async disconnect() {
              this.isConnected = false;
              this.publicKey = null;
            },
            async signMessage(message: Uint8Array) {
              return {
                signature: new Uint8Array(
                  await win.testSignMessage([...message]),
                ),
              };
            },
            async signTransaction(transaction: {
              serialize: (options: unknown) => Uint8Array;
              constructor: { from: (bytes: Uint8Array) => unknown };
            }) {
              const raw = transaction.serialize({
                requireAllSignatures: false,
                verifySignatures: false,
              });
              return transaction.constructor.from(
                new Uint8Array(await win.testSignTransaction([...raw])),
              );
            },
          };
          win.solana = provider;
        });
        const open = async () => {
          await page.goto(`${url}/contracts/detail?id=${contract.id}`);
        };
        const connect = async () => {
          if (
            await page
              .getByRole("button", { name: /^(Disconnect|断开连接)$/ })
              .isVisible()
          )
            return;
          await page
            .getByRole("button", { name: /^(Connect|连接钱包)$/ })
            .click();
          await page
            .getByRole("button", { name: /^(Disconnect|断开连接)$/ })
            .waitFor();
          if (actor === worker) workerStorage = await context.storageState();
        };
        const switchActor = async (wallet: Keypair) => {
          await page
            .getByRole("button", { name: /^(Disconnect|断开连接)$/ })
            .click();
          await page
            .getByRole("button", { name: /^(Connect|连接钱包)$/ })
            .waitFor();
          actor = wallet;
          await connect();
        };
        const settled = async (kind: string) =>
          waitFor(
            async () =>
              Boolean(
                await db.escrowTransaction.findFirst({
                  where: {
                    contractId: contract.id,
                    kind: kind as "dispute_open",
                    status: "reconciled",
                  },
                }),
              ),
            kind,
          );
        try {
          await open();
          if (hasInitialSession)
            await page
              .getByRole("button", { name: /^(Disconnect|断开连接)$/ })
              .waitFor();
          else await connect();
          await page
            .getByLabel(/^(Dispute reason|争议原因)$/)
            .fill("Browser dispute reason");
          const restartCase =
            policy === "bilateral" && outcome === "release_to_worker";
          if (restartCase)
            await page.route(
              "**/api/transactions/record-signed",
              async (route) => {
                await route.fetch();
                await route.abort();
              },
            );
          await page
            .getByRole("button", { name: /^(Open dispute|发起争议)$/ })
            .click();
          if (restartCase) {
            await waitFor(
              async () =>
                Boolean(
                  await db.escrowTransaction.findFirst({
                    where: {
                      contractId: contract.id,
                      kind: "dispute_open",
                      status: "signed",
                    },
                  }),
                ),
              "Signature persisted before broadcast",
            );
            const saved = await db.escrowTransaction.findFirstOrThrow({
              where: {
                contractId: contract.id,
                kind: "dispute_open",
                status: "signed",
              },
            });
            assert.equal(
              (await connection.getSignatureStatuses([saved.txSig!])).value[0],
              null,
            );
            await page.goto("about:blank");
            await page.unroute("**/api/transactions/record-signed");
            await stopServer();
            server = startServer();
            attachLogs(server);
            await waitFor(async () => {
              try {
                return (
                  await fetch(`${url}/api/health`, {
                    method: "POST",
                    headers: { origin: url },
                  })
                ).ok;
              } catch {
                return false;
              }
            }, "Restarted Web server");
            await recoverChainOperation(saved.id);
            await waitFor(
              async () =>
                (await connection.getSignatureStatuses([saved.txSig!])).value[0]
                  ?.confirmationStatus === "finalized",
              "Recovered transaction finality",
            );
            await recoverChainOperation(saved.id);
            await open();
            evidence.push({
              scenario:
                "persisted signature, page unload, app restart, backend broadcast",
              txSig: saved.txSig,
            });
            console.log(
              "PASS browser signature persisted before broadcast, app restart and backend recovery",
            );
          }
          await settled("dispute_open");
          // Reload discards React state while retaining persisted transaction recovery.
          await page.reload();
          if (policy === "bilateral") {
            await switchActor(creator);
            await page
              .getByRole("button", {
                name:
                  outcome === "release_to_worker"
                    ? /^(Propose payment to Worker|提议向乙方放款)$/
                    : /^(Propose refund to Creator|提议退款给甲方)$/,
              })
              .click();
            await settled("dispute_propose");
            await page.reload();
            await switchActor(worker);
            await page
              .getByRole("button", {
                name: /^(Accept settlement|接受和解方案)$/,
              })
              .click();
            await settled(
              outcome === "release_to_worker"
                ? "dispute_accept_release"
                : "dispute_accept_refund",
            );
          } else {
            await switchActor(arbitrator);
            await page
              .getByRole("button", {
                name:
                  outcome === "release_to_worker"
                    ? /^(Award milestone to Worker|裁决里程碑款给乙方)$/
                    : /^(Refund remaining escrow to Creator|退还剩余托管款给甲方)$/,
              })
              .click();
            await settled(
              outcome === "release_to_worker"
                ? "dispute_arbitrate_release"
                : "dispute_arbitrate_refund",
            );
          }
          const result = await db.contract.findUniqueOrThrow({
            where: { id: contract.id },
            include: { escrowTransactions: true, events: true },
          });
          assert.equal(
            result.status,
            outcome === "release_to_worker" ? "completed" : "cancelled",
          );
          assert.equal(
            result.releasedAmount.toString(),
            outcome === "release_to_worker" ? "10" : "0",
          );
          assert.equal(
            result.refundedAmount.toString(),
            outcome === "refund_to_creator" ? "10" : "0",
          );
          assert.deepEqual(errors, []);
          await page.reload();
          await page.setViewportSize({ width: 390, height: 844 });
          await page
            .getByText(contract.title, { exact: true })
            .first()
            .waitFor();
          assert.equal(
            await page.evaluate(
              () => document.documentElement.scrollWidth <= window.innerWidth,
            ),
            true,
          );
          await page.screenshot({
            path: `${output}/browser-${policy}-${outcome}.png`,
            fullPage: true,
          });
          evidence.push({
            policy,
            outcome,
            contractId: result.id,
            F: result.fundedAmount.toString(),
            R: result.releasedAmount.toString(),
            Q: result.refundedAmount.toString(),
            transactions: result.escrowTransactions.map((t) => ({
              kind: t.kind,
              txSig: t.txSig,
              slot: t.finalizedSlot?.toString(),
            })),
          });
          console.log(
            "PASS browser",
            policy,
            outcome,
            JSON.stringify(
              result.escrowTransactions.map((t) => ({
                kind: t.kind,
                txSig: t.txSig,
                slot: t.finalizedSlot?.toString(),
              })),
            ),
          );
        } catch (error) {
          await page.screenshot({
            path: `${output}/browser-failure.png`,
            fullPage: true,
          });
          console.error(await page.locator("body").innerText());
          throw error;
        } finally {
          await context.close();
        }
      }
    await writeFile(
      `${output}/browser-evidence.json`,
      JSON.stringify(evidence, null, 2),
    );
  } catch (error) {
    console.error(serverOutput.slice(-5000));
    throw error;
  } finally {
    await browser.close();
    if (server.pid) {
      if (process.platform !== "win32") process.kill(-server.pid, "SIGTERM");
      else server.kill();
    }
  }
}
