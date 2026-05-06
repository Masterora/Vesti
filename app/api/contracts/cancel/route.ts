import { handleRoute, parseJsonBody } from "@/lib/api/route-helpers";
import { withAuthenticatedWallet } from "@/lib/api/authenticated-wallet";
import { cancelContract } from "@/lib/services/contracts/cancel-contract";
import { cancelContractSchema } from "@/lib/validations/contract";

export async function POST(request: Request) {
  return handleRoute(async () => {
    const body = await parseJsonBody(request);
    return cancelContract(cancelContractSchema.parse(withAuthenticatedWallet(request, body)));
  });
}
