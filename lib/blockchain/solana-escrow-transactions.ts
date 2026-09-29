import { Connection, PublicKey, SystemProgram, Transaction, TransactionInstruction } from "@solana/web3.js";
import {
  decimalToTokenUnits,
  deriveEscrowPda,
  deriveSolanaEscrowAccounts,
  parsePublicKey,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  type SolanaEscrowAccounts
} from "@/lib/blockchain/solana-escrow-accounts";
import { decodeEscrowStateAccount } from "@/lib/blockchain/solana-escrow-reconciliation";
import {
  createInitializeEscrowInstruction,
  createMarkFundedInstruction,
  createReleaseMilestoneInstruction
} from "@/lib/blockchain/solana-escrow-instructions";

type DecimalLike = {
  toString(): string;
};

type SolanaEscrowTransactionConfig = {
  connection: Connection;
  programId: PublicKey;
  usdcMint: PublicKey;
};

export type PreparedSolanaEscrowTransaction = {
  transaction: string;
  escrowAccount: string;
  vaultAccount: string;
  creatorTokenAccount: string;
  workerTokenAccount: string;
  amountUnits: string;
  recentBlockhash: string;
};

function getSolanaEscrowTransactionConfig(): SolanaEscrowTransactionConfig {
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

function serializeTransaction(transaction: Transaction) {
  return transaction.serialize({
    requireAllSignatures: false,
    verifySignatures: false
  }).toString("base64");
}

function createAssociatedTokenAccountIdempotentInstruction(input: {
  payer: PublicKey;
  owner: PublicKey;
  mint: PublicKey;
  tokenAccount: PublicKey;
  tokenProgramId: PublicKey;
}) {
  return new TransactionInstruction({
    programId: ASSOCIATED_TOKEN_PROGRAM_ID,
    keys: [
      { pubkey: input.payer, isSigner: true, isWritable: true },
      { pubkey: input.tokenAccount, isSigner: false, isWritable: true },
      { pubkey: input.owner, isSigner: false, isWritable: false },
      { pubkey: input.mint, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: input.tokenProgramId, isSigner: false, isWritable: false }
    ],
    data: Buffer.from([1])
  });
}

function describePreparedTransaction(input: {
  transaction: Transaction;
  accounts: SolanaEscrowAccounts;
  amountUnits: bigint;
  recentBlockhash: string;
}): PreparedSolanaEscrowTransaction {
  return {
    transaction: serializeTransaction(input.transaction),
    escrowAccount: input.accounts.escrowPda.toBase58(),
    vaultAccount: input.accounts.vaultPda.toBase58(),
    creatorTokenAccount: input.accounts.creatorTokenAccount.toBase58(),
    workerTokenAccount: input.accounts.workerTokenAccount.toBase58(),
    amountUnits: input.amountUnits.toString(),
    recentBlockhash: input.recentBlockhash
  };
}

export async function prepareFundEscrowTransaction(input: {
  contractId: string;
  creatorWallet: string;
  workerWallet: string;
  amount: DecimalLike | string;
}) {
  const config = getSolanaEscrowTransactionConfig();
  const creator = parsePublicKey(input.creatorWallet, "creatorWallet");
  const worker = parsePublicKey(input.workerWallet, "workerWallet");
  const amountUnits = decimalToTokenUnits(input.amount);
  const accounts = deriveSolanaEscrowAccounts({
    contractId: input.contractId,
    programId: config.programId,
    usdcMint: config.usdcMint,
    creator,
    worker,
    tokenProgramId: TOKEN_PROGRAM_ID
  });
  const { blockhash } = await config.connection.getLatestBlockhash("confirmed");
  const transaction = new Transaction({
    feePayer: creator,
    recentBlockhash: blockhash
  }).add(
    createInitializeEscrowInstruction({
      programId: config.programId,
      accounts,
      creator,
      worker,
      usdcMint: config.usdcMint,
      contractId: input.contractId,
      totalAmountUnits: amountUnits
    }),
    createMarkFundedInstruction({
      programId: config.programId,
      accounts,
      creator,
      worker,
      usdcMint: config.usdcMint,
      amountUnits
    })
  );

  return describePreparedTransaction({
    transaction,
    accounts,
    amountUnits,
    recentBlockhash: blockhash
  });
}

export async function inspectPreparedFunding(input: {
  contractId: string;
  recentBlockhash: string;
}): Promise<"valid" | "expired_without_escrow" | "review"> {
  const config = getSolanaEscrowTransactionConfig();
  // A missing local signature does not prove the transaction was never broadcast.
  // Only release its operation lock after the hash is unusable and the
  // finalized chain has no escrow account for this contract.
  const escrowPda = deriveEscrowPda(input.contractId, config.programId).address;
  const account = await config.connection.getAccountInfo(escrowPda, "finalized");
  if (account) return "review";

  const valid = await config.connection.isBlockhashValid(input.recentBlockhash, { commitment: "processed" });
  if (valid.value) return "valid";

  const finalAccount = await config.connection.getAccountInfo(escrowPda, "finalized");
  return finalAccount ? "review" : "expired_without_escrow";
}

export async function inspectPreparedRelease(input: {
  contractId: string;
  creatorWallet: string;
  workerWallet: string;
  fundedAmount: DecimalLike | string;
  releasedAmountBefore: DecimalLike | string;
  recentBlockhash: string;
}): Promise<"valid" | "expired_without_release" | "review"> {
  const config = getSolanaEscrowTransactionConfig();
  const accounts = deriveSolanaEscrowAccounts({
    contractId: input.contractId,
    programId: config.programId,
    usdcMint: config.usdcMint,
    creator: parsePublicKey(input.creatorWallet, "creatorWallet"),
    worker: parsePublicKey(input.workerWallet, "workerWallet")
  });
  const expectedReleased = decimalToTokenUnits(input.releasedAmountBefore);
  const expectedFunded = decimalToTokenUnits(input.fundedAmount);

  const releaseStateIsUnchanged = async () => {
    const info = await config.connection.getAccountInfo(accounts.escrowPda, "finalized");
    if (!info || !info.owner.equals(config.programId)) return false;
    try {
      const state = decodeEscrowStateAccount(info.data);
      return state.contractId === input.contractId &&
        state.creator === input.creatorWallet &&
        state.worker === input.workerWallet &&
        state.usdcMint === config.usdcMint.toBase58() &&
        state.vault === accounts.vaultPda.toBase58() &&
        state.totalAmount === expectedFunded &&
        state.fundedAmount === expectedFunded &&
        state.releasedAmount === expectedReleased &&
        state.status === 1;
    } catch {
      return false;
    }
  };

  // An account already advanced past the database amount may include an
  // unrecorded release. Never replace the preparation in that case.
  if (!(await releaseStateIsUnchanged())) return "review";
  const valid = await config.connection.isBlockhashValid(input.recentBlockhash, { commitment: "processed" });
  if (valid.value) return "valid";
  return (await releaseStateIsUnchanged()) ? "expired_without_release" : "review";
}

export async function prepareReleaseEscrowTransaction(input: {
  contractId: string;
  milestoneId: string;
  creatorWallet: string;
  workerWallet: string;
  amount: DecimalLike | string;
}) {
  const config = getSolanaEscrowTransactionConfig();
  const creator = parsePublicKey(input.creatorWallet, "creatorWallet");
  const worker = parsePublicKey(input.workerWallet, "workerWallet");
  const amountUnits = decimalToTokenUnits(input.amount);
  const accounts = deriveSolanaEscrowAccounts({
    contractId: input.contractId,
    programId: config.programId,
    usdcMint: config.usdcMint,
    creator,
    worker,
    tokenProgramId: TOKEN_PROGRAM_ID
  });
  const { blockhash } = await config.connection.getLatestBlockhash("confirmed");
  const transaction = new Transaction({
    feePayer: creator,
    recentBlockhash: blockhash
  });
  const workerTokenAccount = await config.connection.getAccountInfo(
    accounts.workerTokenAccount,
    "confirmed"
  );

  if (!workerTokenAccount) {
    transaction.add(
      createAssociatedTokenAccountIdempotentInstruction({
        payer: creator,
        owner: worker,
        mint: config.usdcMint,
        tokenAccount: accounts.workerTokenAccount,
        tokenProgramId: accounts.tokenProgramId
      })
    );
  }

  transaction.add(
    createReleaseMilestoneInstruction({
      programId: config.programId,
      accounts,
      creator,
      worker,
      usdcMint: config.usdcMint,
      milestoneId: input.milestoneId,
      amountUnits
    })
  );

  return describePreparedTransaction({
    transaction,
    accounts,
    amountUnits,
    recentBlockhash: blockhash
  });
}
