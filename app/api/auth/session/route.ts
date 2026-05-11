import { handleRoute } from "@/lib/api/route-helpers";
import { getWalletSession } from "@/lib/auth/wallet-session";
import { getSessionUserProfile } from "@/lib/services/user-profiles";

export async function POST(request: Request) {
  return handleRoute(request, async () => {
    const session = getWalletSession(request);
    const profile = session ? await getSessionUserProfile(session.walletAddress) : null;

    return {
      walletAddress: session?.walletAddress ?? null,
      expiresAt: session?.expiresAt ?? null,
      profile
    };
  });
}
