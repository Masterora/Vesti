import { withAuthenticatedWallet } from "@/lib/api/authenticated-wallet";
import { handleRoute, parseJsonBody } from "@/lib/api/route-helpers";
import { proposeDisputeResolution } from "@/lib/services/milestones/propose-dispute-resolution";
import { proposeDisputeResolutionSchema } from "@/lib/validations/proof-submission";

export async function POST(request: Request) {
  return handleRoute(request, async () => {
    const body = await parseJsonBody(request);
    return proposeDisputeResolution(
      proposeDisputeResolutionSchema.parse(withAuthenticatedWallet(request, body))
    );
  });
}
