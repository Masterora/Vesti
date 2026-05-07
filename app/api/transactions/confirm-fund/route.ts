import { withAuthenticatedWallet } from "@/lib/api/authenticated-wallet";
import { handleRoute, parseJsonBody } from "@/lib/api/route-helpers";
import { confirmFundTransaction } from "@/lib/services/transactions/confirm-fund-transaction";
import { confirmFundTransactionSchema } from "@/lib/validations/transaction";

export async function POST(request: Request) {
  return handleRoute(async () => {
    const body = await parseJsonBody(request);
    return confirmFundTransaction(
      confirmFundTransactionSchema.parse(withAuthenticatedWallet(request, body))
    );
  });
}
