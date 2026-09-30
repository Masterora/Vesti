import { withAuthenticatedWallet } from "@/lib/api/authenticated-wallet";
import { handleRoute, parseJsonBody } from "@/lib/api/route-helpers";
import { recordSignedOperation } from "@/lib/services/transactions/chain-operations";
import { recordSignedTransactionSchema } from "@/lib/validations/transaction";
export async function POST(request: Request) {
  return handleRoute(request, async () => {
    const input = recordSignedTransactionSchema.parse(
      withAuthenticatedWallet(request, await parseJsonBody(request)),
    );
    return recordSignedOperation(input);
  });
}
