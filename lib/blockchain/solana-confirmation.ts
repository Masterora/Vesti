import { Connection } from "@solana/web3.js";

function getSolanaConnection() {
  const rpcUrl = process.env.NEXT_PUBLIC_SOLANA_RPC_URL;

  if (!rpcUrl) {
    throw new Error("NEXT_PUBLIC_SOLANA_RPC_URL is required for on-chain escrow mode");
  }

  return new Connection(rpcUrl, "confirmed");
}

export async function confirmSolanaSignature(signature: string) {
  const connection = getSolanaConnection();
  const status = await connection.getSignatureStatus(signature, {
    searchTransactionHistory: true
  });
  const value = status.value;

  if (!value) {
    throw new Error("Solana transaction was not found");
  }

  if (value.err) {
    throw new Error("Solana transaction failed");
  }

  if (value.confirmationStatus !== "confirmed" && value.confirmationStatus !== "finalized") {
    throw new Error("Solana transaction is not confirmed yet");
  }

  return {
    slot: value.slot,
    confirmationStatus: value.confirmationStatus
  };
}
