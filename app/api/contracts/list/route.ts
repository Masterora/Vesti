import { handleRoute, parseJsonBody } from "@/lib/api/route-helpers";
import { listContractsForWallet } from "@/lib/services/contracts/list-contracts-for-wallet";
import { listContractsSchema } from "@/lib/validations/contract";

export async function POST(request: Request) {
  return handleRoute(async () => {
    const body = await parseJsonBody(request);
    return listContractsForWallet(listContractsSchema.parse(body));
  });
}
