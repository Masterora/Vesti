import { Connection } from "@solana/web3.js";
import type { EscrowAdapter, FundContractParams, ReleaseMilestoneParams } from "./escrow-adapter";
import {
  decimalToTokenUnits,
  deriveSolanaEscrowAccounts,
  parsePublicKey,
  TOKEN_PROGRAM_ID,
  type SolanaEscrowAccounts
} from "./solana-escrow-accounts";

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
    programId: parsePublicKey(programId, "ESCROW_PROGRAM_ID"),
    usdcMint: parsePublicKey(usdcMint, "NEXT_PUBLIC_USDC_MINT")
  };
}

function getFundingContext(params: FundContractParams) {
  const config = getSolanaEscrowConfig();
  const creator = parsePublicKey(params.creatorWallet, "creatorWallet");
  const worker = parsePublicKey(params.workerWallet, "workerWallet");
  const accounts = deriveSolanaEscrowAccounts({
    contractId: params.contractId,
    programId: config.programId,
    usdcMint: config.usdcMint,
    creator,
    worker,
    tokenProgramId: TOKEN_PROGRAM_ID
  });

  return {
    ...config,
    creator,
    worker,
    accounts,
    amountUnits: decimalToTokenUnits(params.amount)
  };
}

function getReleaseContext(params: ReleaseMilestoneParams) {
  const config = getSolanaEscrowConfig();
  const creator = parsePublicKey(params.creatorWallet, "creatorWallet");
  const worker = parsePublicKey(params.workerWallet, "workerWallet");
  const accounts = deriveSolanaEscrowAccounts({
    contractId: params.contractId,
    programId: config.programId,
    usdcMint: config.usdcMint,
    creator,
    worker,
    tokenProgramId: TOKEN_PROGRAM_ID
  });

  return {
    ...config,
    creator,
    worker,
    accounts,
    amountUnits: decimalToTokenUnits(params.amount)
  };
}

function notWired(action: string, accounts: SolanaEscrowAccounts, amountUnits: bigint): never {
  throw new Error(
    [
      `Solana escrow adapter config is valid, but ${action} transaction signing is not wired yet.`,
      `Derived escrow=${accounts.escrowPda.toBase58()}`,
      `vault=${accounts.vaultPda.toBase58()}`,
      `amountUnits=${amountUnits.toString()}`
    ].join(" ")
  );
}

export const solanaEscrowAdapter: EscrowAdapter = {
  async fundContract(params) {
    const context = getFundingContext(params);
    notWired("fundContract", context.accounts, context.amountUnits);
  },
  async releaseMilestonePayment(params) {
    const context = getReleaseContext(params);
    notWired("releaseMilestonePayment", context.accounts, context.amountUnits);
  }
};
