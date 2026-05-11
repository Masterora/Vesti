import { handleRoute, parseJsonBody } from "@/lib/api/route-helpers";
import { withAuthenticatedWallet } from "@/lib/api/authenticated-wallet";
import { renameContract } from "@/lib/services/contracts/rename-contract";
import { renameContractSchema } from "@/lib/validations/contract";

export async function POST(request: Request) {
  return handleRoute(request, async () => {
    const body = await parseJsonBody(request);
    return renameContract(renameContractSchema.parse(withAuthenticatedWallet(request, body)));
  });
}
