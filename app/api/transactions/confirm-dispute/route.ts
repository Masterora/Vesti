import { withAuthenticatedWallet } from "@/lib/api/authenticated-wallet";
import { handleRoute, parseJsonBody } from "@/lib/api/route-helpers";
import { confirmChainOperation } from "@/lib/services/transactions/confirm-chain-operation";
import { confirmReleaseTransactionSchema } from "@/lib/validations/transaction";
export async function POST(request: Request) {
  return handleRoute(
    request,
    async () => {
      const input = confirmReleaseTransactionSchema.parse(
        withAuthenticatedWallet(request, await parseJsonBody(request)),
      );
      return confirmChainOperation(input);
    },
    { status: (result) => (result.confirmed ? 200 : 202) },
  );
}
