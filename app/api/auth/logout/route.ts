import { NextResponse } from "next/server";
import { createClearWalletSessionCookie } from "@/lib/auth/wallet-session";

export async function POST() {
  return NextResponse.json(
    {
      data: {
        ok: true
      }
    },
    {
      headers: {
        "Set-Cookie": createClearWalletSessionCookie()
      }
    }
  );
}
