import { withAuthenticatedWallet } from "@/lib/api/authenticated-wallet";
import { handleRoute, parseJsonBody } from "@/lib/api/route-helpers";
import { arbitrateDisputeResolution } from "@/lib/services/milestones/arbitrate-dispute-resolution";
import { arbitrateDisputeResolutionSchema } from "@/lib/validations/proof-submission";

export async function POST(request: Request) {
  return handleRoute(request, async () => {
    const body = await parseJsonBody(request);
    return arbitrateDisputeResolution(
      arbitrateDisputeResolutionSchema.parse(withAuthenticatedWallet(request, body))
    );
  });
}
