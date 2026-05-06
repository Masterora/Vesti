import { handleRoute, parseJsonBody } from "@/lib/api/route-helpers";
import { createWalletAuthChallenge } from "@/lib/services/auth/create-wallet-auth-challenge";
import { createAuthChallengeSchema } from "@/lib/validations/auth";

export async function POST(request: Request) {
  return handleRoute(async () => {
    const body = await parseJsonBody(request);
    return createWalletAuthChallenge(createAuthChallengeSchema.parse(body));
  });
}
