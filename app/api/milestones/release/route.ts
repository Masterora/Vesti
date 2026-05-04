import { handleRoute } from "@/lib/api/route-helpers";
import { releaseMilestonePayment } from "@/lib/services/milestones/release-milestone-payment";
import { releaseMilestoneSchema } from "@/lib/validations/proof-submission";

export async function POST(request: Request) {
  return handleRoute(async () => {
    const body = await request.json();
    return releaseMilestonePayment(releaseMilestoneSchema.parse(body));
  });
}
