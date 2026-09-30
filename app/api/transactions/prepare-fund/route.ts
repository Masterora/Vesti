import { enforceRateLimit } from "@/lib/services/system/enforce-rate-limit";
import { withAuthenticatedWallet } from "@/lib/api/authenticated-wallet";
import { handleRoute, parseJsonBody } from "@/lib/api/route-helpers";
import { prepareFundTransaction } from "@/lib/services/transactions/prepare-fund-transaction";
import { prepareFundTransactionSchema } from "@/lib/validations/transaction";

export async function POST(request: Request) {
  return handleRoute(request, async () => {
    const body = withAuthenticatedWallet(request, await parseJsonBody(request));
    await enforceRateLimit({
      scope: "prepare-fund",
      identity: body.walletAddress,
      limit: 30,
      windowMs: 60000,
    });
    return prepareFundTransaction(
      prepareFundTransactionSchema.parse(
        withAuthenticatedWallet(request, body),
      ),
    );
  });
}
