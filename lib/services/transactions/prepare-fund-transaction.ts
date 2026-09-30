import { getEscrowAdapterMode } from "@/lib/blockchain/escrow-adapter";
import { prepareChainOperation } from "./chain-operations";
import type { PrepareFundTransactionInput } from "@/lib/validations/transaction";
export async function prepareFundTransaction(
  input: PrepareFundTransactionInput,
) {
  if (getEscrowAdapterMode() === "onchain")
    return prepareChainOperation({ ...input, kind: "fund" });
  return {
    mode: "mock",
    action: "fund_contract",
    contractId: input.contractId,
    transaction: null,
    transactionId: null,
    idempotencyKey: input.idempotencyKey,
    canUseDirectAction: true,
  };
}
