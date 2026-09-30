import { getEscrowAdapterMode } from "@/lib/blockchain/escrow-adapter";
import { confirmChainOperation } from "./confirm-chain-operation";
import type { ConfirmReleaseTransactionInput } from "@/lib/validations/transaction";
export async function confirmReleaseTransaction(
  input: ConfirmReleaseTransactionInput,
) {
  if (getEscrowAdapterMode() === "onchain")
    return confirmChainOperation(input, "release");
  return { mode: "mock", confirmed: false, canUseDirectAction: true };
}
