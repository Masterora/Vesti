import { handleRoute, parseJsonBody } from "@/lib/api/route-helpers";
import { withAuthenticatedWallet } from "@/lib/api/authenticated-wallet";
import { submitMilestoneProof } from "@/lib/services/milestones/submit-milestone-proof";
import { submitProofSchema } from "@/lib/validations/proof-submission";

export async function POST(request: Request) {
  return handleRoute(async () => {
    const body = await parseJsonBody(request);
    return submitMilestoneProof(submitProofSchema.parse(withAuthenticatedWallet(request, body)));
  });
}
