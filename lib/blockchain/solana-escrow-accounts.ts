import { Buffer } from "node:buffer";
import { PublicKey } from "@solana/web3.js";

export const USDC_DECIMALS = 6;
export const MAX_ESCROW_CONTRACT_ID_BYTES = 32;

export const TOKEN_PROGRAM_ID = new PublicKey(
  "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
);

export const TOKEN_2022_PROGRAM_ID = new PublicKey(
  "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"
);

export const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey(
  "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
);

type DecimalLike = {
  toString(): string;
};

export type SolanaEscrowAccountSeeds = {
  contractId: string;
  programId: PublicKey;
  usdcMint: PublicKey;
  creator: PublicKey;
  worker: PublicKey;
  tokenProgramId?: PublicKey;
};

export type SolanaEscrowAccounts = {
  escrowPda: PublicKey;
  escrowBump: number;
  vaultPda: PublicKey;
  vaultBump: number;
  creatorTokenAccount: PublicKey;
  workerTokenAccount: PublicKey;
  tokenProgramId: PublicKey;
};

export function parsePublicKey(value: string, label: string) {
  try {
    return new PublicKey(value);
  } catch {
    throw new Error(`${label} must be a valid Solana public key in on-chain escrow mode`);
  }
}

export function assertValidEscrowContractSeed(contractId: string) {
  if (!contractId) {
    throw new Error("contractId is required for on-chain escrow mode");
  }

  const byteLength = Buffer.byteLength(contractId, "utf8");

  if (byteLength > MAX_ESCROW_CONTRACT_ID_BYTES) {
    throw new Error(
      `contractId must be ${MAX_ESCROW_CONTRACT_ID_BYTES} bytes or less for Solana PDA seeds`
    );
  }
}

export function deriveEscrowPda(contractId: string, programId: PublicKey) {
  assertValidEscrowContractSeed(contractId);

  const [address, bump] = PublicKey.findProgramAddressSync(
    [Buffer.from("escrow"), Buffer.from(contractId, "utf8")],
    programId
  );

  return { address, bump };
}

export function deriveVaultPda(contractId: string, programId: PublicKey) {
  assertValidEscrowContractSeed(contractId);

  const [address, bump] = PublicKey.findProgramAddressSync(
    [Buffer.from("vault"), Buffer.from(contractId, "utf8")],
    programId
  );

  return { address, bump };
}

export function deriveAssociatedTokenAccount(
  owner: PublicKey,
  mint: PublicKey,
  tokenProgramId = TOKEN_PROGRAM_ID
) {
  const [address] = PublicKey.findProgramAddressSync(
    [owner.toBuffer(), tokenProgramId.toBuffer(), mint.toBuffer()],
    ASSOCIATED_TOKEN_PROGRAM_ID
  );

  return address;
}

export function deriveSolanaEscrowAccounts({
  contractId,
  programId,
  usdcMint,
  creator,
  worker,
  tokenProgramId = TOKEN_PROGRAM_ID
}: SolanaEscrowAccountSeeds): SolanaEscrowAccounts {
  const escrow = deriveEscrowPda(contractId, programId);
  const vault = deriveVaultPda(contractId, programId);

  return {
    escrowPda: escrow.address,
    escrowBump: escrow.bump,
    vaultPda: vault.address,
    vaultBump: vault.bump,
    creatorTokenAccount: deriveAssociatedTokenAccount(creator, usdcMint, tokenProgramId),
    workerTokenAccount: deriveAssociatedTokenAccount(worker, usdcMint, tokenProgramId),
    tokenProgramId
  };
}

export function decimalToTokenUnits(amount: DecimalLike | string, decimals = USDC_DECIMALS) {
  if (!Number.isInteger(decimals) || decimals < 0) {
    throw new Error("Token decimals must be a non-negative integer");
  }

  const rawAmount = typeof amount === "string" ? amount : amount.toString();

  if (!/^\d+(\.\d+)?$/.test(rawAmount)) {
    throw new Error("Amount must be a positive decimal string");
  }

  const [wholePart, fractionPart = ""] = rawAmount.split(".");

  if (fractionPart.length > decimals) {
    throw new Error(`Amount cannot have more than ${decimals} decimal places`);
  }

  const multiplier = BigInt(10) ** BigInt(decimals);
  const wholeUnits = BigInt(wholePart) * multiplier;
  const fractionUnits = BigInt(fractionPart.padEnd(decimals, "0") || "0");

  return wholeUnits + fractionUnits;
}
