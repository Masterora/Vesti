import { describe, expect, it } from "vitest";
import { Keypair, Transaction, SystemProgram } from "@solana/web3.js";
import { protocolInstruction, type ChainContext } from "./chain-protocol";
import { verifySignedMessage } from "./chain-history";
const creator = Keypair.generate(),
  worker = Keypair.generate();
const context: ChainContext = {
  contractId: "c1",
  milestoneId: "m1",
  creator: creator.publicKey.toBase58(),
  worker: worker.publicKey.toBase58(),
  actor: creator.publicKey.toBase58(),
  policy: "bilateral",
  arbitrator: null,
  programId: Keypair.generate().publicKey.toBase58(),
  mint: Keypair.generate().publicKey.toBase58(),
  genesisHash: "genesis",
  programHash: "hash",
  kind: "dispute_open",
  reasonHash: "ab".repeat(32),
  amount: "1000000",
  version: "9007199254740993",
  funded: "1000000",
  released: "0",
  refunded: "0",
};
describe("durable chain protocol", () => {
  it.each(["bilateral", "arbitrator"] as const)("fits the maximum fixed plan in one %s funding transaction", (policy) => {
    const c: ChainContext = { ...context, contractId: "x".repeat(32), policy, arbitrator: policy === "arbitrator" ? Keypair.generate().publicKey.toBase58() : null, addressScheme: "creator", kind: "fund", amount: "8000000", milestones: Array.from({ length: 8 }, (_, n) => ({ id: `milestone-${n}`, amountUnits: "1000000" })) };
    const transaction = new Transaction({ feePayer: creator.publicKey, recentBlockhash: Keypair.generate().publicKey.toBase58() }).add(protocolInstruction(c, true), protocolInstruction(c));
    expect(transaction.serialize({ requireAllSignatures: false }).length).toBeLessThanOrEqual(1232);
  });
  it("rejects additional transfers even with a valid payer signature", () => {
    const prepared = new Transaction({
      feePayer: creator.publicKey,
      recentBlockhash: Keypair.generate().publicKey.toBase58(),
    }).add(protocolInstruction(context));
    const encoded = prepared
      .serialize({ requireAllSignatures: false })
      .toString("base64");
    prepared.add(
      SystemProgram.transfer({
        fromPubkey: creator.publicKey,
        toPubkey: worker.publicKey,
        lamports: 1,
      }),
    );
    prepared.sign(creator);
    expect(() =>
      verifySignedMessage(
        encoded,
        prepared.serialize().toString("base64"),
        context.actor,
      ),
    ).toThrow("Signed transaction differs");
  });
  it("derives the signature from the immutable message and rejects unsigned bytes", () => {
    const prepared = new Transaction({
      feePayer: creator.publicKey,
      recentBlockhash: Keypair.generate().publicKey.toBase58(),
    }).add(protocolInstruction(context));
    const encoded = prepared
      .serialize({ requireAllSignatures: false })
      .toString("base64");
    expect(() =>
      verifySignedMessage(encoded, encoded, context.actor),
    ).toThrow();
    prepared.sign(creator);
    const signed = prepared.serialize().toString("base64");
    expect(
      verifySignedMessage(encoded, signed, context.actor).signedTransaction,
    ).toBe(signed);
    expect(() =>
      verifySignedMessage(encoded, signed, context.worker),
    ).toThrow();
  });
  it("encodes refund proposals as zero and preserves u64 versions", () => {
    const ix = protocolInstruction({
      ...context,
      kind: "dispute_propose",
      outcome: "refund_to_creator",
    });
    expect(ix.data.readBigUInt64LE(9)).toBe(BigInt(0));
    expect(ix.data.readBigUInt64LE(17).toString()).toBe("9007199254740993");
    const accept = protocolInstruction({
      ...context,
      kind: "dispute_accept_refund",
    });
    expect(accept.data.readBigUInt64LE(16)).toBe(BigInt(1000000));
  });
});
