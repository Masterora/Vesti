import { enforceRateLimit } from "@/lib/services/system/enforce-rate-limit";
import { withAuthenticatedWallet } from "@/lib/api/authenticated-wallet";
import { handleRoute, parseJsonBody } from "@/lib/api/route-helpers";
import { prepareChainOperation } from "@/lib/services/transactions/chain-operations";
import { prepareDisputeTransactionSchema } from "@/lib/validations/transaction";
export async function POST(request: Request) {
  return handleRoute(request, async () => {
    const input = prepareDisputeTransactionSchema.parse(
      withAuthenticatedWallet(request, await parseJsonBody(request)),
    );
    await enforceRateLimit({
      scope: "prepare-dispute",
      identity: input.walletAddress,
      limit: 30,
      windowMs: 60000,
    });
    return prepareChainOperation(input);
  });
}
