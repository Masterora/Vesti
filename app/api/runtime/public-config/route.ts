import { disputeCapability } from "@/lib/blockchain/chain-protocol";
import { handleRoute } from "@/lib/api/route-helpers";
import { getEscrowAdapterMode } from "@/lib/blockchain/escrow-adapter";

export async function POST(request: Request) {
  return handleRoute(request, async () => {
    const escrowMode = getEscrowAdapterMode();
    const canDispute = escrowMode === "mock" || (await disputeCapability());
    return {
      escrowMode,
      network: process.env.NEXT_PUBLIC_SOLANA_NETWORK?.trim() || "unknown",
      canOpenDispute: canDispute,
      canSettleDispute: canDispute,
    };
  });
}
