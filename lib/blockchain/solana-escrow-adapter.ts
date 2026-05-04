import type { EscrowAdapter } from "./escrow-adapter";

export const solanaEscrowAdapter: EscrowAdapter = {
  async fundContract() {
    throw new Error("Solana escrow adapter is not implemented in the MVP phase");
  },
  async releaseMilestonePayment() {
    throw new Error("Solana escrow adapter is not implemented in the MVP phase");
  }
};
