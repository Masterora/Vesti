import { handleRoute } from "@/lib/api/route-helpers";
import { listContractsForWallet } from "@/lib/services/contracts/list-contracts-for-wallet";
import { listContractsSchema } from "@/lib/validations/contract";

export async function POST(request: Request) {
  return handleRoute(async () => {
    const body = await request.json();
    return listContractsForWallet(listContractsSchema.parse(body));
  });
}
