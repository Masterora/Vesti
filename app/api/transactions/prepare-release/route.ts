import { enforceRateLimit } from "@/lib/services/system/enforce-rate-limit";
import { withAuthenticatedWallet } from "@/lib/api/authenticated-wallet";
import { handleRoute, parseJsonBody } from "@/lib/api/route-helpers";
import { prepareReleaseTransaction } from "@/lib/services/transactions/prepare-release-transaction";
import { prepareReleaseTransactionSchema } from "@/lib/validations/transaction";

export async function POST(request: Request) {
  return handleRoute(request, async () => {
    const body = withAuthenticatedWallet(request, await parseJsonBody(request));
    await enforceRateLimit({
      scope: "prepare-release",
      identity: body.walletAddress,
      limit: 30,
      windowMs: 60000,
    });
    return prepareReleaseTransaction(
      prepareReleaseTransactionSchema.parse(
        withAuthenticatedWallet(request, body),
      ),
    );
  });
}
