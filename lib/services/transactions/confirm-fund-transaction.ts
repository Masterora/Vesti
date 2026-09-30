import { getEscrowAdapterMode } from "@/lib/blockchain/escrow-adapter";
import { confirmChainOperation } from "./confirm-chain-operation";
import type { ConfirmFundTransactionInput } from "@/lib/validations/transaction";
export async function confirmFundTransaction(
  input: ConfirmFundTransactionInput,
) {
  if (getEscrowAdapterMode() === "onchain")
    return confirmChainOperation(input, "fund");
  return { mode: "mock", confirmed: false, canUseDirectAction: true };
}
