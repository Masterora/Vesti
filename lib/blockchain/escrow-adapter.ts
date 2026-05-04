import { Prisma } from "@prisma/client";
import { mockedEscrowAdapter } from "./mocked-escrow-adapter";

export type FundContractParams = {
  contractId: string;
  creatorWallet: string;
  workerWallet: string;
  amount: Prisma.Decimal;
};

export type ReleaseMilestoneParams = {
  contractId: string;
  milestoneId: string;
  creatorWallet: string;
  workerWallet: string;
  amount: Prisma.Decimal;
};

export type EscrowAdapter = {
  fundContract(params: FundContractParams): Promise<{
    escrowAccount: string;
    txSig: string;
  }>;
  releaseMilestonePayment(params: ReleaseMilestoneParams): Promise<{
    txSig: string;
  }>;
};

export function getEscrowAdapter(): EscrowAdapter {
  const mode = process.env.ESCROW_ADAPTER_MODE ?? "mock";

  if (mode !== "mock") {
    throw new Error(`Unsupported ESCROW_ADAPTER_MODE: ${mode}`);
  }

  return mockedEscrowAdapter;
}
