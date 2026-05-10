import { handleRoute, parseJsonBody } from "@/lib/api/route-helpers";
import { withAuthenticatedWallet } from "@/lib/api/authenticated-wallet";
import { acceptContractClaim } from "@/lib/services/contracts/accept-contract-claim";
import { acceptContractClaimSchema } from "@/lib/validations/contract";

export async function POST(request: Request) {
  return handleRoute(request, async () => {
    const body = await parseJsonBody(request);
    return acceptContractClaim(
      acceptContractClaimSchema.parse(withAuthenticatedWallet(request, body))
    );
  });
}
