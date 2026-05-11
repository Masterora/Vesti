import { Prisma } from "@prisma/client";
import { mockedEscrowAdapter } from "./mocked-escrow-adapter";
import { solanaEscrowAdapter } from "./solana-escrow-adapter";

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

export type EscrowAdapterMode = "mock" | "onchain";

export function getEscrowAdapterMode(): EscrowAdapterMode {
  const mode = process.env.ESCROW_ADAPTER_MODE?.trim().toLowerCase();

  if (!mode) {
    throw new Error("ESCROW_ADAPTER_MODE is required");
  }

  if (mode === "mock" || mode === "onchain") {
    return mode;
  }

  throw new Error(`Unsupported ESCROW_ADAPTER_MODE: ${mode}`);
}

export function getEscrowAdapter(): EscrowAdapter {
  const mode = getEscrowAdapterMode();

  if (mode === "mock") {
    return mockedEscrowAdapter;
  }

  return solanaEscrowAdapter;
}
