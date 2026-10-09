import { chainRuntimeState } from "@/lib/blockchain/chain-readiness";
import { handleRoute } from "@/lib/api/route-helpers";
import { enforceRateLimit } from "@/lib/services/system/enforce-rate-limit";
export async function POST(request: Request) {
  return handleRoute(request, async () => {
    await enforceRateLimit({ scope: "chain-readiness", identity: "public", limit: 30, windowMs: 60000 });
    return chainRuntimeState();
  }, { status: (state) => state.chainState === "ready" || state.chainState === "paused" ? 200 : 503 });
}
