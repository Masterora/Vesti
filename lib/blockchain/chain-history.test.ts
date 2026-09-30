import { describe, expect, it } from "vitest";
import { Keypair, Transaction, TransactionMessage, VersionedTransaction, SystemProgram, type VersionedTransactionResponse } from "@solana/web3.js";
import { hasEscrowInvocation, isUnallocatedAccount } from "./chain-history";
import { assertChainContextIdentity, type ChainContext } from "./chain-protocol";
const actor = Keypair.generate(), programId = Keypair.generate().publicKey, escrow = Keypair.generate().publicKey;
describe("chain relevance and identity", () => {
  it("does not confuse legacy or v0 SOL donations with program invocation", () => {
    const ix = SystemProgram.transfer({ fromPubkey: actor.publicKey, toPubkey: escrow, lamports: 1 });
    const blockhash = Keypair.generate().publicKey.toBase58();
    const legacy = new Transaction({ feePayer: actor.publicKey, recentBlockhash: blockhash }).add(ix).compileMessage();
    const v0 = new TransactionMessage({ payerKey: actor.publicKey, recentBlockhash: blockhash, instructions: [ix] }).compileToV0Message();
    for (const message of [legacy, v0]) {
      const response = { transaction: { message }, meta: { innerInstructions: [] } } as unknown as VersionedTransactionResponse;
      expect(hasEscrowInvocation(response, programId)).toEqual({ invokes: false, innerInvokes: false });
    }
    expect(new VersionedTransaction(v0).version).toBe(0);
  });
  it("recognizes a loaded-address program invocation and does not skip its CPI", () => {
    const response = { transaction: { message: { staticAccountKeys: [actor.publicKey], compiledInstructions: [{ programIdIndex: 1 }] } }, meta: { loadedAddresses: { writable: [], readonly: [programId] }, innerInstructions: [{ instructions: [{ programIdIndex: 1 }] }] } } as unknown as VersionedTransactionResponse;
    expect(hasEscrowInvocation(response, programId)).toEqual({ invokes: true, innerInvokes: true });
  });
  it("ignores another escrow initialization that appends a victim as a remaining account", () => {
    const otherEscrow = Keypair.generate().publicKey;
    const response = { transaction: { message: { accountKeys: [actor.publicKey, programId, otherEscrow, escrow], instructions: [{ programIdIndex: 1, accounts: [2, 0, 3] }] } }, meta: { innerInstructions: [] } } as unknown as VersionedTransactionResponse;
    expect(hasEscrowInvocation(response, programId, escrow).invokes).toBe(false);
    expect(hasEscrowInvocation(response, programId, otherEscrow).invokes).toBe(true);
  });
  it("accepts only unallocated prefunding as account absence", () => {
    const account = { owner: SystemProgram.programId, data: Buffer.alloc(0), executable: false };
    expect(isUnallocatedAccount(account)).toBe(true);
    expect(isUnallocatedAccount({ ...account, data: Buffer.alloc(1) })).toBe(false);
    expect(isUnallocatedAccount({ ...account, owner: programId })).toBe(false);
    expect(isUnallocatedAccount({ ...account, executable: true })).toBe(false);
  });
  it("pins network, program, code and mint together", () => {
    const mint = Keypair.generate().publicKey;
    const identity = { genesisHash: "g", programHash: "h", programId, mint };
    const c = { genesisHash: "g", programHash: "h", programId: programId.toBase58(), mint: mint.toBase58() } as ChainContext;
    expect(() => assertChainContextIdentity(c, identity)).not.toThrow();
    for (const key of ["genesisHash", "programHash", "programId", "mint"] as const)
      expect(() => assertChainContextIdentity({ ...c, [key]: "different" }, identity)).toThrow("OPERATION_CHAIN_IDENTITY_CHANGED");
  });
});
