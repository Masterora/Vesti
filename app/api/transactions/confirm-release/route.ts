import { withAuthenticatedWallet } from "@/lib/api/authenticated-wallet";
import { handleRoute, parseJsonBody } from "@/lib/api/route-helpers";
import { confirmReleaseTransaction } from "@/lib/services/transactions/confirm-release-transaction";
import { confirmReleaseTransactionSchema } from "@/lib/validations/transaction";

export async function POST(request: Request) {
  return handleRoute(request, async () => {
    const body = await parseJsonBody(request);
    return confirmReleaseTransaction(
      confirmReleaseTransactionSchema.parse(withAuthenticatedWallet(request, body))
    );
  });
}
