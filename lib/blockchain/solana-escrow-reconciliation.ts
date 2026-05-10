import { createHash } from "node:crypto";
import { Buffer } from "node:buffer";
import { Connection, PublicKey, SystemProgram } from "@solana/web3.js";
import { encodeAnchorInstruction, encodeAnchorString, encodeU64 } from "@/lib/blockchain/anchor-encoding";
import {
  TOKEN_PROGRAM_ID,
  decimalToTokenUnits,
  deriveSolanaEscrowAccounts,
  parsePublicKey
} from "@/lib/blockchain/solana-escrow-accounts";
import { ServiceError } from "@/lib/services/errors";

type DecimalLike = {
  toString(): string;
};

type SolanaEscrowConfig = {
  connection: Connection;
  programId: PublicKey;
  usdcMint: PublicKey;
};

type ExpectedInstruction = {
  accounts: string[];
  data: Buffer;
};

export type DecodedEscrowState = {
  contractId: string;
  creator: string;
  worker: string;
  usdcMint: string;
  vault: string;
  totalAmount: bigint;
  fundedAmount: bigint;
  releasedAmount: bigint;
  status: number;
  bump: number;
  vaultBump: number;
};

const ESCROW_STATUS_FUNDED = 1;
const ESCROW_STATUS_COMPLETED = 3;

function reconciliationError(message: string): never {
  throw new ServiceError(
    `Transaction confirmed on-chain, but ${message}. Local state was not updated.`,
    409
  );
}

function accountDiscriminator(name: string) {
  return createHash("sha256").update(`account:${name}`).digest().subarray(0, 8);
}

function getSolanaEscrowConfig(): SolanaEscrowConfig {
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

function decodeAnchorString(data: Buffer, offset: number) {
  const byteLength = data.readUInt32LE(offset);
  const start = offset + 4;
  const end = start + byteLength;

  return {
    value: data.subarray(start, end).toString("utf8"),
    nextOffset: end
  };
}

function decodeEscrowStateU64(data: Buffer, offset: number) {
  return {
    value: data.readBigUInt64LE(offset),
    nextOffset: offset + 8
  };
}

export function decodeEscrowStateAccount(data: Buffer): DecodedEscrowState {
  const expectedDiscriminator = accountDiscriminator("EscrowState");

  if (data.length < expectedDiscriminator.length || !data.subarray(0, 8).equals(expectedDiscriminator)) {
    throw new Error("Escrow account discriminator does not match EscrowState");
  }

  let offset = 8;
  const contractId = decodeAnchorString(data, offset);
  offset = contractId.nextOffset;

  const creator = new PublicKey(data.subarray(offset, offset + 32)).toBase58();
  offset += 32;
  const worker = new PublicKey(data.subarray(offset, offset + 32)).toBase58();
  offset += 32;
  const usdcMint = new PublicKey(data.subarray(offset, offset + 32)).toBase58();
  offset += 32;
  const vault = new PublicKey(data.subarray(offset, offset + 32)).toBase58();
  offset += 32;

  const totalAmount = decodeEscrowStateU64(data, offset);
  offset = totalAmount.nextOffset;
  const fundedAmount = decodeEscrowStateU64(data, offset);
  offset = fundedAmount.nextOffset;
  const releasedAmount = decodeEscrowStateU64(data, offset);
  offset = releasedAmount.nextOffset;

  return {
    contractId: contractId.value,
    creator,
    worker,
    usdcMint,
    vault,
    totalAmount: totalAmount.value,
    fundedAmount: fundedAmount.value,
    releasedAmount: releasedAmount.value,
    status: data.readUInt8(offset),
    bump: data.readUInt8(offset + 1),
    vaultBump: data.readUInt8(offset + 2)
  };
}

function getMessageAccountKeys(transaction: Awaited<ReturnType<Connection["getTransaction"]>>) {
  if (!transaction) {
    reconciliationError("the transaction could not be loaded");
  }

  const message = transaction.transaction.message;

  if ("accountKeys" in message) {
    return message.accountKeys;
  }

  const loadedAddresses = transaction.meta?.loadedAddresses;

  if (!loadedAddresses) {
    reconciliationError("the transaction is missing loaded address metadata");
  }

  return message.getAccountKeys({ accountKeysFromLookups: loadedAddresses }).keySegments().flat();
}

function getMatchingProgramInstructions(input: {
  transaction: Awaited<ReturnType<Connection["getTransaction"]>>;
  programId: PublicKey;
}) {
  if (!input.transaction) {
    reconciliationError("the transaction could not be loaded");
  }

  const message = input.transaction.transaction.message;
  const accountKeys = getMessageAccountKeys(input.transaction);

  return {
    accountKeys,
    instructions: message.compiledInstructions.filter(
      (instruction) =>
        accountKeys[instruction.programIdIndex]?.toBase58() === input.programId.toBase58()
    )
  };
}

function assertExpectedProgramInstructions(input: {
  transaction: Awaited<ReturnType<Connection["getTransaction"]>>;
  programId: PublicKey;
  expected: ExpectedInstruction[];
}) {
  const { accountKeys, instructions } = getMatchingProgramInstructions({
    transaction: input.transaction,
    programId: input.programId
  });

  if (instructions.length !== input.expected.length) {
    reconciliationError("the submitted instruction count does not match the prepared escrow flow");
  }

  input.expected.forEach((expectedInstruction, index) => {
    const instruction = instructions[index];
    const actualAccounts = instruction.accountKeyIndexes.map((accountIndex) =>
      accountKeys[accountIndex]?.toBase58()
    );
    const actualData = Buffer.from(instruction.data);

    if (actualAccounts.length !== expectedInstruction.accounts.length) {
      reconciliationError("the submitted instruction accounts do not match the prepared escrow flow");
    }

    for (let accountIndex = 0; accountIndex < actualAccounts.length; accountIndex += 1) {
      if (actualAccounts[accountIndex] !== expectedInstruction.accounts[accountIndex]) {
        reconciliationError("the submitted instruction accounts do not match the prepared escrow flow");
      }
    }

    if (!actualData.equals(expectedInstruction.data)) {
      reconciliationError("the submitted instruction data does not match the prepared escrow flow");
    }
  });
}

async function assertConfirmedTransaction(signature: string) {
  const { connection } = getSolanaEscrowConfig();
  const transaction = await connection.getTransaction(signature, {
    commitment: "confirmed",
    maxSupportedTransactionVersion: 0
  });

  if (!transaction) {
    throw new Error("Solana transaction was not found");
  }

  if (transaction.meta?.err) {
    throw new Error("Solana transaction failed");
  }

  return transaction;
}

async function fetchEscrowState(input: { connection: Connection; escrow: PublicKey; programId: PublicKey }) {
  const accountInfo = await input.connection.getAccountInfo(input.escrow, "confirmed");

  if (!accountInfo) {
    reconciliationError("the escrow account was not created on-chain");
  }

  if (!accountInfo.owner.equals(input.programId)) {
    reconciliationError("the escrow account owner does not match the deployed program");
  }

  return decodeEscrowStateAccount(accountInfo.data);
}

async function assertVaultBalance(input: {
  connection: Connection;
  vault: PublicKey;
  expectedAmountUnits: bigint;
}) {
  const balance = await input.connection.getTokenAccountBalance(input.vault, "confirmed");
  const actualAmount = BigInt(balance.value.amount);

  if (actualAmount !== input.expectedAmountUnits) {
    reconciliationError("the vault token balance does not match the escrow state");
  }
}

function assertEscrowStateMatches(
  actual: DecodedEscrowState,
  expected: Omit<DecodedEscrowState, "bump" | "vaultBump">
) {
  if (
    actual.contractId !== expected.contractId ||
    actual.creator !== expected.creator ||
    actual.worker !== expected.worker ||
    actual.usdcMint !== expected.usdcMint ||
    actual.vault !== expected.vault ||
    actual.totalAmount !== expected.totalAmount ||
    actual.fundedAmount !== expected.fundedAmount ||
    actual.releasedAmount !== expected.releasedAmount ||
    actual.status !== expected.status
  ) {
    reconciliationError("the escrow account state does not match the expected contract state");
  }
}

export async function reconcileFundEscrowTransaction(input: {
  txSig: string;
  contractId: string;
  creatorWallet: string;
  workerWallet: string;
  totalAmount: DecimalLike | string;
}) {
  const config = getSolanaEscrowConfig();
  const creator = parsePublicKey(input.creatorWallet, "creatorWallet");
  const worker = parsePublicKey(input.workerWallet, "workerWallet");
  const accounts = deriveSolanaEscrowAccounts({
    contractId: input.contractId,
    programId: config.programId,
    usdcMint: config.usdcMint,
    creator,
    worker,
    tokenProgramId: TOKEN_PROGRAM_ID
  });
  const totalAmountUnits = decimalToTokenUnits(input.totalAmount);
  const transaction = await assertConfirmedTransaction(input.txSig);

  assertExpectedProgramInstructions({
    transaction,
    programId: config.programId,
    expected: [
      {
        accounts: [
          accounts.escrowPda.toBase58(),
          creator.toBase58(),
          config.usdcMint.toBase58(),
          accounts.vaultPda.toBase58(),
          accounts.tokenProgramId.toBase58(),
          SystemProgram.programId.toBase58()
        ],
        data: encodeAnchorInstruction("initialize_escrow", [
          encodeAnchorString(input.contractId),
          Buffer.from(worker.toBytes()),
          encodeU64(totalAmountUnits)
        ])
      },
      {
        accounts: [
          accounts.escrowPda.toBase58(),
          creator.toBase58(),
          accounts.creatorTokenAccount.toBase58(),
          config.usdcMint.toBase58(),
          accounts.vaultPda.toBase58(),
          accounts.tokenProgramId.toBase58()
        ],
        data: encodeAnchorInstruction("mark_funded", [encodeU64(totalAmountUnits)])
      }
    ]
  });

  const escrowState = await fetchEscrowState({
    connection: config.connection,
    escrow: accounts.escrowPda,
    programId: config.programId
  });

  assertEscrowStateMatches(escrowState, {
    contractId: input.contractId,
    creator: creator.toBase58(),
    worker: worker.toBase58(),
    usdcMint: config.usdcMint.toBase58(),
    vault: accounts.vaultPda.toBase58(),
    totalAmount: totalAmountUnits,
    fundedAmount: totalAmountUnits,
    releasedAmount: BigInt(0),
    status: ESCROW_STATUS_FUNDED
  });

  await assertVaultBalance({
    connection: config.connection,
    vault: accounts.vaultPda,
    expectedAmountUnits: totalAmountUnits
  });

  return {
    confirmation: {
      slot: transaction.slot,
      confirmationStatus: "confirmed" as const
    },
    escrowAccount: accounts.escrowPda.toBase58()
  };
}

export async function reconcileReleaseEscrowTransaction(input: {
  txSig: string;
  contractId: string;
  milestoneId: string;
  creatorWallet: string;
  workerWallet: string;
  fundedAmount: DecimalLike | string;
  releasedAmountBefore: DecimalLike | string;
  milestoneAmount: DecimalLike | string;
}) {
  const config = getSolanaEscrowConfig();
  const creator = parsePublicKey(input.creatorWallet, "creatorWallet");
  const worker = parsePublicKey(input.workerWallet, "workerWallet");
  const accounts = deriveSolanaEscrowAccounts({
    contractId: input.contractId,
    programId: config.programId,
    usdcMint: config.usdcMint,
    creator,
    worker,
    tokenProgramId: TOKEN_PROGRAM_ID
  });
  const fundedAmountUnits = decimalToTokenUnits(input.fundedAmount);
  const releasedAmountBeforeUnits = decimalToTokenUnits(input.releasedAmountBefore);
  const milestoneAmountUnits = decimalToTokenUnits(input.milestoneAmount);
  const releasedAmountUnits = releasedAmountBeforeUnits + milestoneAmountUnits;
  const remainingVaultUnits = fundedAmountUnits - releasedAmountUnits;
  const transaction = await assertConfirmedTransaction(input.txSig);

  assertExpectedProgramInstructions({
    transaction,
    programId: config.programId,
    expected: [
      {
        accounts: [
          accounts.escrowPda.toBase58(),
          creator.toBase58(),
          worker.toBase58(),
          config.usdcMint.toBase58(),
          accounts.vaultPda.toBase58(),
          accounts.workerTokenAccount.toBase58(),
          accounts.tokenProgramId.toBase58()
        ],
        data: encodeAnchorInstruction("release_milestone", [
          encodeAnchorString(input.milestoneId),
          encodeU64(milestoneAmountUnits)
        ])
      }
    ]
  });

  const escrowState = await fetchEscrowState({
    connection: config.connection,
    escrow: accounts.escrowPda,
    programId: config.programId
  });

  assertEscrowStateMatches(escrowState, {
    contractId: input.contractId,
    creator: creator.toBase58(),
    worker: worker.toBase58(),
    usdcMint: config.usdcMint.toBase58(),
    vault: accounts.vaultPda.toBase58(),
    totalAmount: fundedAmountUnits,
    fundedAmount: fundedAmountUnits,
    releasedAmount: releasedAmountUnits,
    status: releasedAmountUnits === fundedAmountUnits ? ESCROW_STATUS_COMPLETED : ESCROW_STATUS_FUNDED
  });

  await assertVaultBalance({
    connection: config.connection,
    vault: accounts.vaultPda,
    expectedAmountUnits: remainingVaultUnits
  });

  return {
    confirmation: {
      slot: transaction.slot,
      confirmationStatus: "confirmed" as const
    }
  };
}
