import { spawn, type ChildProcess } from "node:child_process";
import { createPrivateKey, sign } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { Keypair } from "@solana/web3.js";
import bs58 from "bs58";
import { chromium } from "playwright";
export async function runSessionIsolationBrowser() {
  const configs = [
    { port: 18991, cookie: "vesti_local_session", secret: "isolated-local-secret", wallet: Keypair.generate() },
    { port: 18992, cookie: "vesti_devnet_session", secret: "isolated-devnet-secret", wallet: Keypair.generate() },
  ];
  const processes: ChildProcess[] = [];
  const browser = await chromium.launch({ headless: true, executablePath: process.env.VESTI_BROWSER_EXECUTABLE });
  const context = await browser.newContext();
  try {
    for (const config of configs) {
      const appUrl = `http://127.0.0.1:${config.port}`;
      const child = spawn("corepack", ["pnpm", "exec", "next", "start", "--port", config.port.toString()], { env: { ...process.env, NEXT_PUBLIC_APP_URL: appUrl, AUTH_SESSION_COOKIE_NAME: config.cookie, AUTH_SECRET: config.secret, ESCROW_ADAPTER_MODE: "mock" }, stdio: "ignore", detached: process.platform !== "win32" });
      processes.push(child);
      let ready = false;
      for (let n = 0; n < 100; n++) { try { const result = await fetch(`${appUrl}/api/health`, { method: "POST", headers: { origin: appUrl } }); if (result.ok) { ready = true; break; } } catch {} await new Promise((r) => setTimeout(r, 200)); }
      assert.ok(ready, "Independent application failed to start");
    }
    const pages = await Promise.all(configs.map(() => context.newPage()));
    for (const [n, config] of configs.entries()) {
      const page = pages[n], url = `http://127.0.0.1:${config.port}`;
      await page.goto(url);
      const challenge = await page.evaluate(async (address) => (await (await fetch("/api/auth/challenge", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ walletAddress: address }) })).json()).data, config.wallet.publicKey.toBase58());
      const key = createPrivateKey({ key: Buffer.concat([Buffer.from("302e020100300506032b657004220420", "hex"), Buffer.from(config.wallet.secretKey.subarray(0, 32))]), format: "der", type: "pkcs8" });
      const signature = bs58.encode(sign(null, Buffer.from(challenge.message), key));
      const verified = await page.evaluate(async (input) => (await fetch("/api/auth/verify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) })).ok, { walletAddress: config.wallet.publicKey.toBase58(), nonce: challenge.nonce, signature });
      assert.ok(verified, "Signature authentication failed");
    }
    const session = (n: number) => pages[n].evaluate(async () => (await (await fetch("/api/auth/session", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" })).json()).data.walletAddress);
    assert.equal(await session(0), configs[0].wallet.publicKey.toBase58()); assert.equal(await session(1), configs[1].wallet.publicKey.toBase58());
    const cookies = await context.cookies(); assert.ok(cookies.some((c) => c.name === configs[0].cookie)); assert.ok(cookies.some((c) => c.name === configs[1].cookie));
    await pages[1].evaluate(() => fetch("/api/auth/logout", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }));
    assert.equal(await session(1), null); assert.equal(await session(0), configs[0].wallet.publicKey.toBase58());
    await mkdir("output/iteration-3/test", { recursive: true });
    await writeFile("output/iteration-3/test/session-isolation.json", JSON.stringify({ caseId: "D24", status: "passed", origins: configs.map((c) => `http://127.0.0.1:${c.port}`), cookieNames: configs.map((c) => c.cookie), sharedBrowserContext: true, independentSecrets: true, loginAndLogoutIsolation: true }, null, 2));
    console.log("PASS D24 simultaneous applications share browser storage without session overwrite or cross-logout");
  } finally {
    await context.close(); await browser.close();
    for (const child of processes) if (child.pid && child.exitCode === null) {
      const stopped = new Promise<void>((resolve) => child.once("exit", () => resolve()));
      if (process.platform !== "win32") process.kill(-child.pid, "SIGTERM"); else child.kill(); await stopped;
    }
  }
}
