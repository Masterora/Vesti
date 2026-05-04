import { handleRoute, parseJsonBody } from "@/lib/api/route-helpers";
import { approveMilestone } from "@/lib/services/milestones/approve-milestone";
import { approveMilestoneSchema } from "@/lib/validations/proof-submission";

export async function POST(request: Request) {
  return handleRoute(async () => {
    const body = await parseJsonBody(request);
    return approveMilestone(approveMilestoneSchema.parse(body));
  });
}
