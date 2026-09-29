import { handleRoute } from "@/lib/api/route-helpers";
import { getEscrowAdapterMode } from "@/lib/blockchain/escrow-adapter";

export async function POST(request: Request) {
  return handleRoute(request, async () => {
    const escrowMode = getEscrowAdapterMode();
    return {
      escrowMode,
      network: process.env.NEXT_PUBLIC_SOLANA_NETWORK?.trim() || "unknown",
      canOpenDispute: escrowMode === "mock",
      canSettleDispute: escrowMode === "mock"
    };
  });
}
