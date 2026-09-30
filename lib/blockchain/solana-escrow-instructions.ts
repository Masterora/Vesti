import { PublicKey, SystemProgram, TransactionInstruction } from "@solana/web3.js";
import {
  encodeAnchorInstruction,
  encodeAnchorString,
  encodeU64
} from "@/lib/blockchain/anchor-encoding";
import {
  TOKEN_PROGRAM_ID,
  deriveDisputePolicyPda,
  deriveMilestoneReleaseReceiptPda,
  hashMilestoneId,
  deriveMilestonePlanPda,
  type SolanaEscrowAccounts
} from "@/lib/blockchain/solana-escrow-accounts";

type CommonInstructionParams = {
  programId: PublicKey;
  accounts: SolanaEscrowAccounts;
  creator: PublicKey;
  worker: PublicKey;
  usdcMint: PublicKey;
  milestones?: { id: string; amountUnits: string }[];
  historical?: boolean;
};

function planKeys(accounts: SolanaEscrowAccounts, programId: PublicKey, historical = false) {
  if (accounts.addressScheme === "legacy" && historical) return [];
  return [{ pubkey: accounts.addressScheme === "legacy" ? programId : deriveMilestonePlanPda(accounts.escrowPda, programId), isSigner: false, isWritable: false }];
}
function planData(accounts: SolanaEscrowAccounts, milestones?: { id: string; amountUnits: string }[]) {
  if (accounts.addressScheme === "legacy") return [];
  if (!milestones?.length || milestones.length > 8) throw new Error("On-chain contracts require 1 to 8 committed milestones");
  const length = Buffer.alloc(4); length.writeUInt32LE(milestones.length);
  return [length, ...milestones.flatMap((m) => [hashMilestoneId(m.id), encodeU64(BigInt(m.amountUnits))])];
}

export function createInitializeEscrowInstruction({
  programId,
  accounts,
  creator,
  worker,
  usdcMint,
  contractId,
  totalAmountUnits,
  milestones
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
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ...(accounts.addressScheme === "legacy" ? [] : [{ pubkey: deriveMilestonePlanPda(accounts.escrowPda, programId), isSigner: false, isWritable: true }])
    ],
    data: encodeAnchorInstruction(accounts.addressScheme === "legacy" ? "initialize_escrow" : "initialize_escrow_v2", [
      encodeAnchorString(contractId),
      Buffer.from(worker.toBytes()),
      encodeU64(totalAmountUnits),
      ...planData(accounts, milestones)
    ])
  });
}

export function createInitializeEscrowWithArbitratorInstruction({
  programId,
  accounts,
  creator,
  worker,
  usdcMint,
  contractId,
  totalAmountUnits,
  arbitrator,
  milestones
}: CommonInstructionParams & {
  contractId: string;
  totalAmountUnits: bigint;
  arbitrator: PublicKey;
}) {
  return new TransactionInstruction({
    programId,
    keys: [
      { pubkey: accounts.escrowPda, isSigner: false, isWritable: true },
      { pubkey: creator, isSigner: true, isWritable: true },
      { pubkey: usdcMint, isSigner: false, isWritable: false },
      { pubkey: accounts.vaultPda, isSigner: false, isWritable: true },
      { pubkey: deriveDisputePolicyPda(accounts.escrowPda, programId).address, isSigner: false, isWritable: true },
      { pubkey: accounts.tokenProgramId, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ...(accounts.addressScheme === "legacy" ? [] : [{ pubkey: deriveMilestonePlanPda(accounts.escrowPda, programId), isSigner: false, isWritable: true }])
    ],
    data: encodeAnchorInstruction(accounts.addressScheme === "legacy" ? "initialize_escrow_with_arbitrator" : "initialize_escrow_with_arbitrator_v2", [
      encodeAnchorString(contractId),
      Buffer.from(worker.toBytes()),
      encodeU64(totalAmountUnits),
      Buffer.from(arbitrator.toBytes()),
      ...planData(accounts, milestones)
    ])
  });
}

export function createMarkFundedInstruction({
  programId,
  accounts,
  creator,
  usdcMint,
  amountUnits,
  historical
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
      { pubkey: accounts.tokenProgramId ?? TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      ...planKeys(accounts, programId, historical)
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
  amountUnits,
  historical
}: CommonInstructionParams & {
  milestoneId: string;
  amountUnits: bigint;
}) {
  return new TransactionInstruction({
    programId,
    keys: [
      { pubkey: accounts.escrowPda, isSigner: false, isWritable: true },
      { pubkey: creator, isSigner: true, isWritable: true },
      { pubkey: worker, isSigner: false, isWritable: false },
      { pubkey: usdcMint, isSigner: false, isWritable: false },
      { pubkey: accounts.vaultPda, isSigner: false, isWritable: true },
      { pubkey: accounts.workerTokenAccount, isSigner: false, isWritable: true },
      { pubkey: accounts.tokenProgramId ?? TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: deriveMilestoneReleaseReceiptPda(accounts.escrowPda, milestoneId, programId).address, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ...planKeys(accounts, programId, historical)
    ],
    data: encodeAnchorInstruction("release_milestone", [
      encodeAnchorString(milestoneId),
      encodeU64(amountUnits),
      hashMilestoneId(milestoneId)
    ])
  });
}
