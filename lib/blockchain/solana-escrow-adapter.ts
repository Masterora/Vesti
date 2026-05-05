import { Connection, PublicKey } from "@solana/web3.js";
import type { EscrowAdapter } from "./escrow-adapter";

function getSolanaEscrowConfig() {
  const rpcUrl = process.env.NEXT_PUBLIC_SOLANA_RPC_URL;
  const programId = process.env.ESCROW_PROGRAM_ID;
  const usdcMint = process.env.NEXT_PUBLIC_USDC_MINT;

  if (!rpcUrl) {
    throw new Error("NEXT_PUBLIC_SOLANA_RPC_URL is required for on-chain escrow mode");
  }

  if (!programId) {
    throw new Error("ESCROW_PROGRAM_ID is required for on-chain escrow mode");
  }

  if (!usdcMint) {
    throw new Error("NEXT_PUBLIC_USDC_MINT is required for on-chain escrow mode");
  }

  return {
    connection: new Connection(rpcUrl, "confirmed"),
    programId: new PublicKey(programId),
    usdcMint: new PublicKey(usdcMint)
  };
}

function notWired(action: string): never {
  throw new Error(
    `Solana escrow adapter config is valid, but ${action} transaction signing is not wired yet`
  );
}

export const solanaEscrowAdapter: EscrowAdapter = {
  async fundContract() {
    getSolanaEscrowConfig();
    notWired("fundContract");
  },
  async releaseMilestonePayment() {
    getSolanaEscrowConfig();
    notWired("releaseMilestonePayment");
  }
};
