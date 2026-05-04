import { handleRoute, parseJsonBody } from "@/lib/api/route-helpers";
import { releaseMilestonePayment } from "@/lib/services/milestones/release-milestone-payment";
import { releaseMilestoneSchema } from "@/lib/validations/proof-submission";

export async function POST(request: Request) {
  return handleRoute(async () => {
    const body = await parseJsonBody(request);
    return releaseMilestonePayment(releaseMilestoneSchema.parse(body));
  });
}
