import { randomUUID } from "node:crypto";
import type { EscrowAdapter } from "./escrow-adapter";

function txSig(action: string) {
  return `mock_${action}_${randomUUID()}`;
}

export const mockedEscrowAdapter: EscrowAdapter = {
  async fundContract(params) {
    return {
      escrowAccount: `mock_escrow_${params.contractId}`,
      txSig: txSig("fund")
    };
  },
  async releaseMilestonePayment() {
    return {
      txSig: txSig("release")
    };
  }
};
