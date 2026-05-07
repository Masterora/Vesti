import { handleRoute, parseJsonBody } from "@/lib/api/route-helpers";
import { withAuthenticatedWallet } from "@/lib/api/authenticated-wallet";
import { getContractById } from "@/lib/services/contracts/get-contract-by-id";
import { getContractSchema } from "@/lib/validations/contract";

export async function POST(request: Request) {
  return handleRoute(async () => {
    const body = await parseJsonBody(request);
    return getContractById(getContractSchema.parse(withAuthenticatedWallet(request, body)));
  });
}
