import { withAuthenticatedWallet } from "@/lib/api/authenticated-wallet";
import { handleRoute, parseJsonBody } from "@/lib/api/route-helpers";
import { prepareFundTransaction } from "@/lib/services/transactions/prepare-fund-transaction";
import { prepareFundTransactionSchema } from "@/lib/validations/transaction";

export async function POST(request: Request) {
  return handleRoute(async () => {
    const body = await parseJsonBody(request);
    return prepareFundTransaction(
      prepareFundTransactionSchema.parse(withAuthenticatedWallet(request, body))
    );
  });
}
