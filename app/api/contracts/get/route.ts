import { handleRoute, parseJsonBody } from "@/lib/api/route-helpers";
import { resolveOptionalRequestWallet } from "@/lib/auth/wallet-session";
import { getContractById } from "@/lib/services/contracts/get-contract-by-id";
import { getContractSchema } from "@/lib/validations/contract";

export async function POST(request: Request) {
  return handleRoute(request, async () => {
    const body = await parseJsonBody(request);
    return getContractById(
      getContractSchema.parse({
        ...body,
        walletAddress: resolveOptionalRequestWallet(
          request,
          typeof body.walletAddress === "string" ? body.walletAddress : undefined
        )
      })
    );
  });
}
