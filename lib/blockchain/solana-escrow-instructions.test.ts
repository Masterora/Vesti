import { PublicKey } from "@solana/web3.js";
import { describe, expect, it } from "vitest";
import {
  createInitializeEscrowInstruction,
  createMarkFundedInstruction,
  createReleaseMilestoneInstruction
} from "./solana-escrow-instructions";
import { deriveSolanaEscrowAccounts, TOKEN_PROGRAM_ID } from "./solana-escrow-accounts";

const programId = new PublicKey("H1cs7KqkmmPXMEppuTa7VrVC1apSaYtqUD5hJekwQqyC");
const usdcMint = new PublicKey("4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU");
const creator = new PublicKey("11111111111111111111111111111112");
const worker = new PublicKey("11111111111111111111111111111113");
const contractId = "contract_123";
const milestoneId = "milestone_1";
const accounts = deriveSolanaEscrowAccounts({
  contractId,
  programId,
  usdcMint,
  creator,
  worker,
  tokenProgramId: TOKEN_PROGRAM_ID
});

describe("Solana escrow instructions", () => {
  it("builds initialize escrow instruction accounts and data", () => {
    const instruction = createInitializeEscrowInstruction({
      programId,
      accounts,
      creator,
      worker,
      usdcMint,
      contractId,
      totalAmountUnits: BigInt(1000)
    });

    expect(instruction.programId.toBase58()).toBe(programId.toBase58());
    expect(instruction.keys.map((key) => key.pubkey.toBase58())).toEqual([
      accounts.escrowPda.toBase58(),
      creator.toBase58(),
      usdcMint.toBase58(),
      accounts.vaultPda.toBase58(),
      TOKEN_PROGRAM_ID.toBase58(),
      "11111111111111111111111111111111"
    ]);
    expect(instruction.keys[1]).toMatchObject({ isSigner: true, isWritable: true });
    expect(instruction.data.subarray(0, 8).toString("hex")).toBe("f3a04d990b5c30d1");
  });

  it("builds mark funded instruction", () => {
    const instruction = createMarkFundedInstruction({
      programId,
      accounts,
      creator,
      worker,
      usdcMint,
      amountUnits: BigInt(1000)
    });

    expect(instruction.keys.map((key) => key.pubkey.toBase58())).toEqual([
      accounts.escrowPda.toBase58(),
      creator.toBase58(),
      accounts.creatorTokenAccount.toBase58(),
      usdcMint.toBase58(),
      accounts.vaultPda.toBase58(),
      TOKEN_PROGRAM_ID.toBase58()
    ]);
    expect(instruction.data.toString("hex")).toBe("9a19863dc8b81d38e803000000000000");
  });

  it("builds release milestone instruction", () => {
    const instruction = createReleaseMilestoneInstruction({
      programId,
      accounts,
      creator,
      worker,
      usdcMint,
      milestoneId,
      amountUnits: BigInt(250)
    });

    expect(instruction.keys.map((key) => key.pubkey.toBase58())).toEqual([
      accounts.escrowPda.toBase58(),
      creator.toBase58(),
      worker.toBase58(),
      usdcMint.toBase58(),
      accounts.vaultPda.toBase58(),
      accounts.workerTokenAccount.toBase58(),
      TOKEN_PROGRAM_ID.toBase58()
    ]);
    expect(instruction.data.subarray(0, 8).toString("hex")).toBe("3802c7a4b86ca7de");
  });
});
