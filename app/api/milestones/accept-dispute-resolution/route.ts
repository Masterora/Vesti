import { withAuthenticatedWallet } from "@/lib/api/authenticated-wallet";
import { handleRoute, parseJsonBody } from "@/lib/api/route-helpers";
import { acceptDisputeResolution } from "@/lib/services/milestones/accept-dispute-resolution";
import { acceptDisputeResolutionSchema } from "@/lib/validations/proof-submission";

export async function POST(request: Request) {
  return handleRoute(request, async () => {
    const body = await parseJsonBody(request);
    return acceptDisputeResolution(
      acceptDisputeResolutionSchema.parse(withAuthenticatedWallet(request, body))
    );
  });
}
