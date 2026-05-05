import { handleRoute, parseJsonBody } from "@/lib/api/route-helpers";
import { cancelContract } from "@/lib/services/contracts/cancel-contract";
import { cancelContractSchema } from "@/lib/validations/contract";

export async function POST(request: Request) {
  return handleRoute(async () => {
    const body = await parseJsonBody(request);
    return cancelContract(cancelContractSchema.parse(body));
  });
}
