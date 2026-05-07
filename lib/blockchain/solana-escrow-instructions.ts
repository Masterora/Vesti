import { PublicKey, SystemProgram, TransactionInstruction } from "@solana/web3.js";
import {
  encodeAnchorInstruction,
  encodeAnchorString,
  encodeU64
} from "@/lib/blockchain/anchor-encoding";
import {
  TOKEN_PROGRAM_ID,
  type SolanaEscrowAccounts
} from "@/lib/blockchain/solana-escrow-accounts";

type CommonInstructionParams = {
  programId: PublicKey;
  accounts: SolanaEscrowAccounts;
  creator: PublicKey;
  worker: PublicKey;
  usdcMint: PublicKey;
};

export function createInitializeEscrowInstruction({
  programId,
  accounts,
  creator,
  worker,
  usdcMint,
  contractId,
  totalAmountUnits
}: CommonInstructionParams & {
  contractId: string;
  totalAmountUnits: bigint;
}) {
  return new TransactionInstruction({
    programId,
    keys: [
      { pubkey: accounts.escrowPda, isSigner: false, isWritable: true },
      { pubkey: creator, isSigner: true, isWritable: true },
      { pubkey: usdcMint, isSigner: false, isWritable: false },
      { pubkey: accounts.vaultPda, isSigner: false, isWritable: true },
      { pubkey: accounts.tokenProgramId, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false }
    ],
    data: encodeAnchorInstruction("initialize_escrow", [
      encodeAnchorString(contractId),
      Buffer.from(worker.toBytes()),
      encodeU64(totalAmountUnits)
    ])
  });
}

export function createMarkFundedInstruction({
  programId,
  accounts,
  creator,
  usdcMint,
  amountUnits
}: CommonInstructionParams & {
  amountUnits: bigint;
}) {
  return new TransactionInstruction({
    programId,
    keys: [
      { pubkey: accounts.escrowPda, isSigner: false, isWritable: true },
      { pubkey: creator, isSigner: true, isWritable: false },
      { pubkey: accounts.creatorTokenAccount, isSigner: false, isWritable: true },
      { pubkey: usdcMint, isSigner: false, isWritable: false },
      { pubkey: accounts.vaultPda, isSigner: false, isWritable: true },
      { pubkey: accounts.tokenProgramId ?? TOKEN_PROGRAM_ID, isSigner: false, isWritable: false }
    ],
    data: encodeAnchorInstruction("mark_funded", [encodeU64(amountUnits)])
  });
}

export function createReleaseMilestoneInstruction({
  programId,
  accounts,
  creator,
  worker,
  usdcMint,
  milestoneId,
  amountUnits
}: CommonInstructionParams & {
  milestoneId: string;
  amountUnits: bigint;
}) {
  return new TransactionInstruction({
    programId,
    keys: [
      { pubkey: accounts.escrowPda, isSigner: false, isWritable: true },
      { pubkey: creator, isSigner: true, isWritable: false },
      { pubkey: worker, isSigner: false, isWritable: false },
      { pubkey: usdcMint, isSigner: false, isWritable: false },
      { pubkey: accounts.vaultPda, isSigner: false, isWritable: true },
      { pubkey: accounts.workerTokenAccount, isSigner: false, isWritable: true },
      { pubkey: accounts.tokenProgramId ?? TOKEN_PROGRAM_ID, isSigner: false, isWritable: false }
    ],
    data: encodeAnchorInstruction("release_milestone", [
      encodeAnchorString(milestoneId),
      encodeU64(amountUnits)
    ])
  });
}
