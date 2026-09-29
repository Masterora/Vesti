import { handleRoute, parseJsonBody } from "@/lib/api/route-helpers";
import { getWalletSession } from "@/lib/auth/wallet-session";
import { ServiceError } from "@/lib/services/errors";
import { queryWorkspace } from "@/lib/services/contracts/query-workspace";
import { workspaceQuerySchema } from "@/lib/validations/workspace-query";

export async function POST(request: Request) {
  return handleRoute(request, async () => {
    const input = workspaceQuerySchema.parse(await parseJsonBody(request));
    const walletAddress = getWalletSession(request)?.walletAddress;
    if (input.kind !== "marketplace" && !walletAddress) {
      throw new ServiceError("Wallet session is required", 401);
    }
    return queryWorkspace(input, walletAddress);
  });
}
