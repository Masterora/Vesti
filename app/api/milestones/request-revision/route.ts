import { handleRoute, parseJsonBody } from "@/lib/api/route-helpers";
import { requestMilestoneRevision } from "@/lib/services/milestones/request-milestone-revision";
import { requestRevisionSchema } from "@/lib/validations/proof-submission";

export async function POST(request: Request) {
  return handleRoute(async () => {
    const body = await parseJsonBody(request);
    return requestMilestoneRevision(requestRevisionSchema.parse(body));
  });
}
