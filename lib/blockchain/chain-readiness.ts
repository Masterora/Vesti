import { chainIdentity, disputeCapability } from "./chain-protocol";
import { configuredRelease } from "./release-manifest";
import { currentReleaseControl } from "@/lib/services/releases/release-control";
import { configuredProtocolRegistry } from "./protocol-version-registry";
import { ServiceError } from "@/lib/services/errors";
import { enforceRateLimit } from "@/lib/services/system/enforce-rate-limit";

async function computeChainRuntimeState() {
  const mock = process.env.ESCROW_ADAPTER_MODE !== "onchain";
  const state = { escrowMode: mock ? "mock" : "onchain", network: process.env.NEXT_PUBLIC_SOLANA_NETWORK || "unknown", releaseId: process.env.ESCROW_RELEASE_ID || null, mintAddress: null as string | null, assetLabel: process.env.NEXT_PUBLIC_SOLANA_NETWORK === "devnet" ? "test_usdc" : "usdc",
    chainState: "ready", canPrepareFunds: mock, canOpenDispute: mock, canSettleDispute: mock,
    recoveryState: mock ? "available" : "temporarily_unavailable", reasonCode: null as string | null,
    maintenancePhase: "draining", maintenanceEpoch: "0" };
  if (mock) return { ...state, maintenancePhase: "open" };
  try {
    // Shared by every public alias and every application process. Denial never probes RPC.
    try { await enforceRateLimit({ scope: "chain-runtime-probe", identity: "public", limit: 30, windowMs: 60000 }); }
    catch { throw new ServiceError("Chain probe is temporarily unavailable", 503, "CHAIN_RPC_UNAVAILABLE"); }
    const release = configuredRelease();
    state.mintAddress = release.manifest.mint.address;
    if (release.manifest.cluster === "devnet" && !configuredProtocolRegistry()) throw new ServiceError("Historical registry is required", 503, "CHAIN_CONFIG_INVALID");
    const control = await currentReleaseControl();
    if (!control || (control.activeManifestSha256 !== release.manifestSha256 && !(control.phase === "rebinding" && control.targetManifestSha256 === release.manifestSha256))) throw new ServiceError("Chain release differs", 503, "CHAIN_CONFIG_INVALID");
    state.maintenancePhase = control.phase;
    state.maintenanceEpoch = control.epoch.toString();
    await chainIdentity();
    state.recoveryState = ["open", "draining"].includes(control.phase) ? "available" : "paused";
    state.canPrepareFunds = control.phase === "open" && process.env.ESCROW_CHAIN_NEW_OPERATIONS_ENABLED === "true";
    state.canOpenDispute = state.canSettleDispute = state.canPrepareFunds && await disputeCapability();
    if (!state.canPrepareFunds) { state.chainState = "paused"; state.reasonCode = "NEW_OPERATIONS_PAUSED"; }
  } catch (error) {
    state.canPrepareFunds = state.canOpenDispute = state.canSettleDispute = false;
    state.chainState = error instanceof ServiceError && error.code !== "CHAIN_RPC_UNAVAILABLE" ? "mismatch" : "unavailable";
    state.reasonCode = error instanceof ServiceError ? error.code : "CHAIN_RPC_UNAVAILABLE";
    state.recoveryState = error instanceof ServiceError && error.code !== "CHAIN_RPC_UNAVAILABLE" ? "identity_mismatch" : "temporarily_unavailable";
  }
  return state;
}

type RuntimeState = Awaited<ReturnType<typeof computeChainRuntimeState>>;
let cached: { key: string; expiresAt: number; state: RuntimeState } | null = null;
let inFlight: { key: string; promise: Promise<RuntimeState> } | null = null;
const observationTtlMs = 5000;
function runtimeKey() {
  return JSON.stringify(["ESCROW_ADAPTER_MODE", "ESCROW_RELEASE_ID", "ESCROW_RELEASE_MANIFEST_PATH", "ESCROW_PROTOCOL_REGISTRY_PATH", "ESCROW_PROTOCOL_REGISTRY_SHA256",
    "SOLANA_SERVER_RPC_URL", "NEXT_PUBLIC_SOLANA_RPC_URL", "NEXT_PUBLIC_SOLANA_NETWORK", "ESCROW_PROGRAM_ID", "NEXT_PUBLIC_USDC_MINT", "ESCROW_NETWORK_GENESIS_HASH",
    "ESCROW_PROGRAM_SHA256", "ESCROW_CHAIN_NEW_OPERATIONS_ENABLED", "ESCROW_CHAIN_DISPUTES_ENABLED"].map((name) => process.env[name]));
}
export function chainRuntimeState() {
  const key = runtimeKey();
  if (cached?.key === key && cached.expiresAt > Date.now()) return Promise.resolve(cached.state);
  if (inFlight?.key === key) return inFlight.promise;
  const entry = { key, promise: computeChainRuntimeState().then((state) => {
    // This is UI observation only. Financial identity/phase/epoch guards never use this cache.
    if (runtimeKey() === key) cached = { key, expiresAt: Date.now() + observationTtlMs, state };
    return state;
  }).finally(() => { if (inFlight === entry) inFlight = null; }) };
  inFlight = entry;
  return entry.promise;
}
