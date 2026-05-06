import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { parseJsonBody } from "@/lib/api/route-helpers";
import { createWalletSessionCookie } from "@/lib/auth/wallet-session";
import { ServiceError } from "@/lib/services/errors";
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
    if (error instanceof ServiceError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    if (error instanceof ZodError) {
      return NextResponse.json(
        {
          error: "Invalid request body",
          details: error.flatten()
        },
        { status: 400 }
      );
    }

    console.error(error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
