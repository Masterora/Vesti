import { handleRoute, parseJsonBody } from "@/lib/api/route-helpers";
import { createContract } from "@/lib/services/contracts/create-contract";
import { createContractSchema } from "@/lib/validations/contract";

export async function POST(request: Request) {
  return handleRoute(async () => {
    const body = await parseJsonBody(request);
    return createContract(createContractSchema.parse(body));
  });
}
