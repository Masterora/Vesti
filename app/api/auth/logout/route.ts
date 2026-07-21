import { createClearWalletSessionCookie } from "@/lib/auth/wallet-session";
import { createRouteErrorResponse, createRouteSuccessResponse } from "@/lib/api/route-helpers";
import { assertTrustedRequestOrigin } from "@/lib/api/request-security";

export async function POST(request: Request) {
  try {
    assertTrustedRequestOrigin(request);
    return createRouteSuccessResponse(
      request,
      { ok: true },
      {
        headers: {
          "Set-Cookie": createClearWalletSessionCookie()
        }
      }
    );
  } catch (error) {
    return createRouteErrorResponse(request, error);
  }
}
