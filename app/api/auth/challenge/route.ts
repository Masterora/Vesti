import { handleRoute, parseJsonBody } from "@/lib/api/route-helpers";
import { getRequestClientIdentity } from "@/lib/api/request-security";
import { createWalletAuthChallenge } from "@/lib/services/auth/create-wallet-auth-challenge";
import { enforceRateLimit } from "@/lib/services/system/enforce-rate-limit";
import { createAuthChallengeSchema } from "@/lib/validations/auth";

export async function POST(request: Request) {
  return handleRoute(request, async () => {
    const body = await parseJsonBody(request);
    const input = createAuthChallengeSchema.parse(body);
    await enforceRateLimit({
        scope: "auth-challenge-client",
        identity: getRequestClientIdentity(request),
        limit: 20,
        windowMs: 5 * 60_000
      });

    return createWalletAuthChallenge(input);
  });
}
