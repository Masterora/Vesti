import { resolveRequestWallet } from "@/lib/auth/wallet-session";

type JsonObject = Record<string, unknown>;

function readWalletField(body: JsonObject, walletField: string) {
  const value = body[walletField];

  return typeof value === "string" ? value : undefined;
}

export function withAuthenticatedWallet<TBody extends JsonObject>(
  request: Request,
  body: TBody,
  walletField = "walletAddress"
) {
  return {
    ...body,
    [walletField]: resolveRequestWallet(request, readWalletField(body, walletField))
  };
}
