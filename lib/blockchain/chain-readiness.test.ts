import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { createServer } from "node:http";
import { Keypair } from "@solana/web3.js";
import { createHash } from "node:crypto";
const mocks = vi.hoisted(() => ({ identity: vi.fn(), dispute: vi.fn(), control: vi.fn(), limit: vi.fn() }));
vi.mock("./chain-protocol", () => ({ chainIdentity: mocks.identity, disputeCapability: mocks.dispute }));
vi.mock("./release-manifest", () => ({ configuredRelease: () => ({ manifestSha256: "approved", manifest: { cluster: "devnet", mint: { address: "mint" } } }) }));
vi.mock("./protocol-version-registry", () => ({ configuredProtocolRegistry: () => ({}) }));
vi.mock("@/lib/services/releases/release-control", () => ({ currentReleaseControl: mocks.control }));
vi.mock("@/lib/services/system/enforce-rate-limit", () => ({ enforceRateLimit: mocks.limit }));
beforeEach(() => {
  vi.resetModules(); vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2026-10-09T00:00:00Z"));
  vi.stubEnv("ESCROW_ADAPTER_MODE", "onchain"); vi.stubEnv("ESCROW_CHAIN_NEW_OPERATIONS_ENABLED", "true");
  mocks.identity.mockReset().mockResolvedValue({}); mocks.dispute.mockReset().mockResolvedValue(true);
  mocks.control.mockReset().mockResolvedValue({ activeManifestSha256: "approved", phase: "open", epoch: 1n }); mocks.limit.mockReset().mockResolvedValue(undefined);
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });
const request = (path: string) => new Request(`http://localhost${path}`, { method: "POST" });
describe("bounded public chain probes", () => {
  it("bounds actual RPC reads while live financial identity checks reject a changed program", async () => {
    const actual = await vi.importActual<typeof import("./chain-protocol")>("./chain-protocol");
    const program = Keypair.generate().publicKey.toBase58(), mint = Keypair.generate().publicKey.toBase58(), genesis = Keypair.generate().publicKey.toBase58();
    const bytes = Buffer.from("approved-program"); let calls = 0, executable = true;
    const server = createServer(async (request, response) => {
      let body = ""; for await (const chunk of request) body += chunk;
      const rpc = JSON.parse(body); calls++;
      const data = rpc.params?.[0] === program ? bytes : Buffer.alloc(82); if (data.length === 82) { data[44] = 6; data[45] = 1; }
      const result = rpc.method === "getGenesisHash" ? genesis : { context: { slot: 100 }, value: { data: [data.toString("base64"), "base64"], owner: rpc.params[0] === program ? "BPFLoader2111111111111111111111111111111111" : "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA", executable: rpc.params[0] === program && executable, lamports: 1, rentEpoch: 0 } };
      response.setHeader("content-type", "application/json"); response.end(JSON.stringify({ jsonrpc: "2.0", id: rpc.id, result }));
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    try {
      vi.stubEnv("SOLANA_SERVER_RPC_URL", `http://127.0.0.1:${(server.address() as { port: number }).port}`);
      vi.stubEnv("ESCROW_PROGRAM_ID", program); vi.stubEnv("NEXT_PUBLIC_USDC_MINT", mint); vi.stubEnv("ESCROW_NETWORK_GENESIS_HASH", genesis);
      vi.stubEnv("ESCROW_PROGRAM_SHA256", createHash("sha256").update(bytes).digest("hex")); vi.stubEnv("NEXT_PUBLIC_SOLANA_NETWORK", "localnet"); vi.stubEnv("ESCROW_CHAIN_DISPUTES_ENABLED", "true");
      mocks.identity.mockImplementation(actual.chainIdentity); mocks.dispute.mockImplementation(actual.disputeCapability);
      const route = await import("@/app/api/runtime/public-config/route");
      for (let n = 0; n < 35; n++) { const response = await route.POST(request("/api/runtime/public-config")); expect(response.status).toBe(200); expect((await response.json()).data.canPrepareFunds).toBe(true); }
      expect(calls).toBe(6);
      executable = false;
      // Warm UI observations cannot authorize financial operations against changed identity.
      await expect(actual.chainIdentity()).rejects.toThrow("program is unavailable");
      vi.setSystemTime(Date.now() + 5001);
      expect((await (await route.POST(request("/api/runtime/public-config"))).json()).data.canPrepareFunds).toBe(false);
    } finally { server.closeAllConnections(); await new Promise<void>((resolve) => server.close(() => resolve())); }
  });
  it("closes the 35-request public-config trigger and shares its cache with readiness", async () => {
    const publicRoute = await import("@/app/api/runtime/public-config/route"), readiness = await import("@/app/api/runtime/chain-readiness/route");
    for (let n = 0; n < 35; n++) expect((await publicRoute.POST(request("/api/runtime/public-config"))).status).toBe(200);
    expect((await readiness.POST(request("/api/runtime/chain-readiness"))).status).toBe(200);
    expect(mocks.identity).toHaveBeenCalledTimes(1);
    expect(mocks.limit.mock.calls.filter(([p]) => p.scope === "chain-runtime-probe")).toHaveLength(1);
    expect(mocks.limit.mock.calls.some(([p]) => p.scope === "chain-readiness")).toBe(true);
  });
  it("does not serve expired ready state after a failed refresh", async () => {
    const { chainRuntimeState } = await import("./chain-readiness");
    expect((await chainRuntimeState()).canPrepareFunds).toBe(true);
    vi.setSystemTime(Date.now() + 5001); mocks.limit.mockRejectedValue(new Error("quota exhausted"));
    const state = await chainRuntimeState();
    expect(state.chainState).toBe("unavailable"); expect(state.canPrepareFunds).toBe(false); expect(state.canSettleDispute).toBe(false);
    expect(state.recoveryState).toBe("temporarily_unavailable"); expect(mocks.identity).toHaveBeenCalledTimes(1);
    const readiness = await import("@/app/api/runtime/chain-readiness/route");
    mocks.limit.mockResolvedValue(undefined);
    expect((await readiness.POST(request("/api/runtime/chain-readiness"))).status).toBe(503);
  });
  it("coalesces simultaneous requests, invalidates changed pins and preserves paused recovery", async () => {
    const { chainRuntimeState } = await import("./chain-readiness");
    await Promise.all(Array.from({ length: 35 }, chainRuntimeState)); expect(mocks.identity).toHaveBeenCalledTimes(1);
    vi.stubEnv("ESCROW_CHAIN_NEW_OPERATIONS_ENABLED", "false"); mocks.control.mockResolvedValue({ activeManifestSha256: "approved", phase: "draining", epoch: 2n });
    const state = await chainRuntimeState(); expect(state.chainState).toBe("paused"); expect(state.canPrepareFunds).toBe(false); expect(state.recoveryState).toBe("available");
    expect(mocks.identity).toHaveBeenCalledTimes(2);
  });
  it("clears every operation flag when the second identity probe fails", async () => {
    mocks.dispute.mockRejectedValue(new Error("RPC failed during capability probe"));
    const { chainRuntimeState } = await import("./chain-readiness");
    const state = await chainRuntimeState();
    expect(state.chainState).toBe("unavailable");
    expect(state.canPrepareFunds).toBe(false); expect(state.canOpenDispute).toBe(false); expect(state.canSettleDispute).toBe(false);
    expect(state.recoveryState).toBe("temporarily_unavailable");
  });
  it("shares a global budget across separately loaded application instances", async () => {
    let probes = 0;
    mocks.limit.mockImplementation(async (policy) => { if (policy.scope === "chain-runtime-probe" && ++probes > policy.limit) throw new Error("shared DB quota"); });
    for (let n = 0; n < 35; n++) {
      vi.resetModules(); const { chainRuntimeState } = await import("./chain-readiness");
      expect((await chainRuntimeState()).chainState).toBe(n < 30 ? "ready" : "unavailable");
    }
    expect(mocks.identity).toHaveBeenCalledTimes(30);
    expect(mocks.limit.mock.calls.every(([policy]) => policy.identity === "public" && policy.scope === "chain-runtime-probe")).toBe(true);
  });
  it("does not consume DB or RPC in mock mode", async () => {
    vi.stubEnv("ESCROW_ADAPTER_MODE", "mock"); const { chainRuntimeState } = await import("./chain-readiness");
    expect((await chainRuntimeState()).canPrepareFunds).toBe(true); expect(mocks.limit).not.toHaveBeenCalled(); expect(mocks.identity).not.toHaveBeenCalled();
  });
});
