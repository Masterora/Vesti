import { handleRoute, parseJsonBody } from "@/lib/api/route-helpers";
import { withAuthenticatedWallet } from "@/lib/api/authenticated-wallet";
import { deleteContract } from "@/lib/services/contracts/delete-contract";
import { deleteContractSchema } from "@/lib/validations/contract";

export async function POST(request: Request) {
  return handleRoute(request, async () => {
    const body = await parseJsonBody(request);
    return deleteContract(deleteContractSchema.parse(withAuthenticatedWallet(request, body)));
  });
}
