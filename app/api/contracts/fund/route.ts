import { handleRoute, parseJsonBody } from "@/lib/api/route-helpers";
import { fundContract } from "@/lib/services/contracts/fund-contract";
import { fundContractSchema } from "@/lib/validations/contract";

export async function POST(request: Request) {
  return handleRoute(async () => {
    const body = await parseJsonBody(request);
    return fundContract(fundContractSchema.parse(body));
  });
}
