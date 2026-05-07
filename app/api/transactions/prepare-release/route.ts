import { withAuthenticatedWallet } from "@/lib/api/authenticated-wallet";
import { handleRoute, parseJsonBody } from "@/lib/api/route-helpers";
import { prepareReleaseTransaction } from "@/lib/services/transactions/prepare-release-transaction";
import { prepareReleaseTransactionSchema } from "@/lib/validations/transaction";

export async function POST(request: Request) {
  return handleRoute(async () => {
    const body = await parseJsonBody(request);
    return prepareReleaseTransaction(
      prepareReleaseTransactionSchema.parse(withAuthenticatedWallet(request, body))
    );
  });
}
