import { handleRoute, parseJsonBody } from "@/lib/api/route-helpers";
import { withAuthenticatedWallet } from "@/lib/api/authenticated-wallet";
import { createContractComment } from "@/lib/services/contracts/create-contract-comment";
import { createContractCommentSchema } from "@/lib/validations/contract";

export async function POST(request: Request) {
  return handleRoute(request, async () => {
    const body = await parseJsonBody(request);
    return createContractComment(createContractCommentSchema.parse(withAuthenticatedWallet(request, body)));
  });
}
