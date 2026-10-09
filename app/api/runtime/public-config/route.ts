import { chainRuntimeState } from "@/lib/blockchain/chain-readiness";
import { handleRoute } from "@/lib/api/route-helpers";
export async function POST(request: Request) {
  return handleRoute(request, chainRuntimeState);
}
