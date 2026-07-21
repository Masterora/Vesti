import { withAuthenticatedWallet } from "@/lib/api/authenticated-wallet";
import { handleRoute, parseJsonBody } from "@/lib/api/route-helpers";
import { submitEscrowTransaction } from "@/lib/services/transactions/submit-escrow-transaction";
import { submitEscrowTransactionSchema } from "@/lib/validations/transaction";

export async function POST(request: Request) {
  return handleRoute(request, async () => {
    const body = await parseJsonBody(request);
    const transaction = await submitEscrowTransaction(
      submitEscrowTransactionSchema.parse(withAuthenticatedWallet(request, body))
    );

    return {
      transactionId: transaction.id,
      status: transaction.status,
      submittedAt: transaction.submittedAt?.toISOString() ?? null
    };
  });
}
