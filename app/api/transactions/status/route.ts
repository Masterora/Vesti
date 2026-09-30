import { withAuthenticatedWallet } from "@/lib/api/authenticated-wallet";
import { handleRoute, parseJsonBody } from "@/lib/api/route-helpers";
import { operationStatus } from "@/lib/services/transactions/chain-operations";
import { transactionStatusSchema } from "@/lib/validations/transaction";
export async function POST(request: Request) {
  return handleRoute(request, async () => {
    const input = transactionStatusSchema.parse(
      withAuthenticatedWallet(request, await parseJsonBody(request)),
    );
    return operationStatus(input.transactionId, input.walletAddress);
  });
}
