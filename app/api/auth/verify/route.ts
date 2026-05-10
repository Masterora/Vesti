import { NextResponse } from "next/server";
import { createRouteErrorResponse, parseJsonBody } from "@/lib/api/route-helpers";
import { createWalletSessionCookie } from "@/lib/auth/wallet-session";
import { verifyWalletAuthChallenge } from "@/lib/services/auth/verify-wallet-auth-challenge";
import { verifyAuthChallengeSchema } from "@/lib/validations/auth";

export async function POST(request: Request) {
  try {
    const body = await parseJsonBody(request);
    const result = await verifyWalletAuthChallenge(verifyAuthChallengeSchema.parse(body));
    const cookie = createWalletSessionCookie(result.walletAddress);

    return NextResponse.json(
      {
        data: {
          walletAddress: result.walletAddress,
          expiresAt: cookie.session.expiresAt
        }
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
