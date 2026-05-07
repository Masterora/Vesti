import { handleRoute } from "@/lib/api/route-helpers";
import { getWalletSession } from "@/lib/auth/wallet-session";

export async function POST(request: Request) {
  return handleRoute(async () => {
    const session = getWalletSession(request);

    return {
      walletAddress: session?.walletAddress ?? null,
      expiresAt: session?.expiresAt ?? null
    };
  });
}
