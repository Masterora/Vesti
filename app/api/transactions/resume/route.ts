import { enforceRateLimit } from "@/lib/services/system/enforce-rate-limit";
import { withAuthenticatedWallet } from "@/lib/api/authenticated-wallet";
import { handleRoute, parseJsonBody } from "@/lib/api/route-helpers";
import { resumePreparedOperation } from "@/lib/services/transactions/chain-operations";
import { transactionStatusSchema } from "@/lib/validations/transaction";
export async function POST(request: Request) {
  return handleRoute(request, async () => {
    const input = transactionStatusSchema.parse(
      withAuthenticatedWallet(request, await parseJsonBody(request)),
    );
    await enforceRateLimit({
      scope: "resume",
      identity: input.walletAddress,
      limit: 30,
      windowMs: 60000,
    });
    return resumePreparedOperation(input);
  });
}
