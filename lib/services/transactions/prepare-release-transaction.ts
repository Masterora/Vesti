import { getEscrowAdapterMode } from "@/lib/blockchain/escrow-adapter";
import { prepareChainOperation } from "./chain-operations";
import type { PrepareReleaseTransactionInput } from "@/lib/validations/transaction";
export async function prepareReleaseTransaction(
  input: PrepareReleaseTransactionInput,
) {
  if (getEscrowAdapterMode() === "onchain")
    return prepareChainOperation({ ...input, kind: "release" });
  return {
    mode: "mock",
    action: "release_milestone",
    contractId: input.contractId,
    milestoneId: input.milestoneId,
    transaction: null,
    transactionId: null,
    idempotencyKey: input.idempotencyKey,
    canUseDirectAction: true,
  };
}
