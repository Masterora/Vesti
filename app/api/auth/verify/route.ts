import { createRouteErrorResponse, createRouteSuccessResponse, parseJsonBody } from "@/lib/api/route-helpers";
import { assertTrustedRequestOrigin, getRequestClientIdentity } from "@/lib/api/request-security";
import { createWalletSessionCookie } from "@/lib/auth/wallet-session";
import { verifyWalletAuthChallenge } from "@/lib/services/auth/verify-wallet-auth-challenge";
import { enforceRateLimit } from "@/lib/services/system/enforce-rate-limit";
import { verifyAuthChallengeSchema } from "@/lib/validations/auth";

export async function POST(request: Request) {
  try {
    assertTrustedRequestOrigin(request);
    const body = await parseJsonBody(request);
    const input = verifyAuthChallengeSchema.parse(body);
    await Promise.all([
      enforceRateLimit({
        scope: "auth-verify-wallet",
        identity: input.walletAddress,
        limit: 10,
        windowMs: 5 * 60_000
      }),
      enforceRateLimit({
        scope: "auth-verify-client",
        identity: getRequestClientIdentity(request),
        limit: 30,
        windowMs: 5 * 60_000
      })
    ]);
    const result = await verifyWalletAuthChallenge(input);
    const cookie = createWalletSessionCookie(result.walletAddress);

    return createRouteSuccessResponse(
      request,
      {
        walletAddress: result.walletAddress,
        expiresAt: cookie.session.expiresAt,
        profile: result.profile
      },
      {
        headers: {
          "Set-Cookie": cookie.value
        }
      }
    );
  } catch (error) {
    return createRouteErrorResponse(request, error);
  }
}
