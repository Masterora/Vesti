import { handleRoute, parseJsonBody } from "@/lib/api/route-helpers";
import { withAuthenticatedWallet } from "@/lib/api/authenticated-wallet";
import { claimContract } from "@/lib/services/contracts/claim-contract";
import { claimContractSchema } from "@/lib/validations/contract";

export async function POST(request: Request) {
  return handleRoute(request, async () => {
    const body = await parseJsonBody(request);
    return claimContract(claimContractSchema.parse(withAuthenticatedWallet(request, body)));
  });
}
