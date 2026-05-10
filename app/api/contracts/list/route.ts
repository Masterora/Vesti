import { handleRoute, parseJsonBody } from "@/lib/api/route-helpers";
import { resolveOptionalRequestWallet } from "@/lib/auth/wallet-session";
import { listContractsForWallet } from "@/lib/services/contracts/list-contracts-for-wallet";
import { listContractsSchema } from "@/lib/validations/contract";

export async function POST(request: Request) {
  return handleRoute(request, async () => {
    const body = await parseJsonBody(request);
    return listContractsForWallet(
      listContractsSchema.parse({
        ...body,
        walletAddress:
          resolveOptionalRequestWallet(
            request,
            typeof body.walletAddress === "string" ? body.walletAddress : undefined
          ) ?? undefined
      })
    );
  });
}
