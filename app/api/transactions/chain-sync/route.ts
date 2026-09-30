import { enforceRateLimit } from "@/lib/services/system/enforce-rate-limit";
import { withAuthenticatedWallet } from "@/lib/api/authenticated-wallet";
import { handleRoute, parseJsonBody } from "@/lib/api/route-helpers";
import { syncContractChain } from "@/lib/services/transactions/chain-sync";
import { chainSyncSchema } from "@/lib/validations/transaction";
export async function POST(request: Request) {
  return handleRoute(request, async () => {
    const input = chainSyncSchema.parse(
      withAuthenticatedWallet(request, await parseJsonBody(request)),
    );
    await enforceRateLimit({
      scope: "chain-sync",
      identity: input.walletAddress,
      limit: 30,
      windowMs: 60000,
    });
    return syncContractChain(input.contractId, input.walletAddress).then(
      (snapshot) => ({ status: "synced", baseline: snapshot.baseline }),
    );
  });
}
