import { withAuthenticatedWallet } from "@/lib/api/authenticated-wallet";
import { handleRoute, parseJsonBody } from "@/lib/api/route-helpers";
import { updateContractVisibility } from "@/lib/services/contracts/update-contract-visibility";
import { updateContractVisibilitySchema } from "@/lib/validations/contract";

export async function POST(request: Request) {
  return handleRoute(request, async () => {
    const body = await parseJsonBody(request);
    return updateContractVisibility(
      updateContractVisibilitySchema.parse(withAuthenticatedWallet(request, body))
    );
  });
}
