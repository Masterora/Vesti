import { handleRoute, parseJsonBody } from "@/lib/api/route-helpers";
import { resolveRequestWallet } from "@/lib/auth/wallet-session";
import { updateSessionUserProfile } from "@/lib/services/user-profiles";
import { updateProfileSchema } from "@/lib/validations/profile";

export async function POST(request: Request) {
  return handleRoute(request, async () => {
    const body = updateProfileSchema.parse(await parseJsonBody(request));
    const walletAddress = resolveRequestWallet(request);

    return updateSessionUserProfile({
      walletAddress,
      ...body
    });
  });
}
