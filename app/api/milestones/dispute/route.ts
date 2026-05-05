import { handleRoute, parseJsonBody } from "@/lib/api/route-helpers";
import { disputeMilestone } from "@/lib/services/milestones/dispute-milestone";
import { disputeMilestoneSchema } from "@/lib/validations/proof-submission";

export async function POST(request: Request) {
  return handleRoute(async () => {
    const body = await parseJsonBody(request);
    return disputeMilestone(disputeMilestoneSchema.parse(body));
  });
}
