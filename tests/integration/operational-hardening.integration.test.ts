import { generateKeyPairSync, randomUUID, sign } from "node:crypto";
import bs58 from "bs58";
import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { createWalletAuthChallenge } from "@/lib/services/auth/create-wallet-auth-challenge";
import { verifyWalletAuthChallenge } from "@/lib/services/auth/verify-wallet-auth-challenge";
import { createContract } from "@/lib/services/contracts/create-contract";
import { enforceRateLimit } from "@/lib/services/system/enforce-rate-limit";
import { submitEscrowTransaction } from "@/lib/services/transactions/submit-escrow-transaction";

describe("operational hardening", () => {
  it("consumes a signed wallet challenge exactly once under concurrency", async () => {
    const { publicKey, privateKey } = generateKeyPairSync("ed25519");
    const publicKeyDer = publicKey.export({ format: "der", type: "spki" });
    const walletAddress = bs58.encode(Buffer.from(publicKeyDer).subarray(-32));
    const challenge = await createWalletAuthChallenge({ walletAddress });
    const signature = bs58.encode(sign(null, Buffer.from(challenge.message, "utf8"), privateKey));
    const attempts = await Promise.allSettled([
      verifyWalletAuthChallenge({ walletAddress, nonce: challenge.nonce, signature }),
      verifyWalletAuthChallenge({ walletAddress, nonce: challenge.nonce, signature })
    ]);

    expect(attempts.filter((attempt) => attempt.status === "fulfilled")).toHaveLength(1);
    expect(attempts.filter((attempt) => attempt.status === "rejected")).toHaveLength(1);
  });

  it("enforces a shared database rate limit", async () => {
    const identity = randomUUID();
    const policy = {
      scope: "integration-test",
      identity,
      limit: 2,
      windowMs: 60_000,
      now: new Date("2026-07-21T02:00:15.000Z")
    };

    await enforceRateLimit(policy);
    await enforceRateLimit(policy);
    await expect(enforceRateLimit(policy)).rejects.toThrow("Too many requests");
  });

  it("records a submitted chain signature idempotently", async () => {
    const creatorWallet = `creator_${randomUUID()}`;
    const workerWallet = `worker_${randomUUID()}`;
    const contract = await createContract({
      creatorWallet,
      workerWallet,
      title: "Submission recovery",
      totalAmount: "10",
      milestones: [{ title: "Delivery", amount: "10" }]
    });
    const transaction = await db.escrowTransaction.create({
      data: {
        contractId: contract.id,
        action: "fund",
        mode: "onchain",
        walletAddress: creatorWallet,
        amount: "10",
        idempotencyKey: randomUUID(),
        operationKey: `fund:${contract.id}`
      }
    });
    const input = {
      contractId: contract.id,
      walletAddress: creatorWallet,
      transactionId: transaction.id,
      txSig: `signature_${randomUUID()}`
    };
    const results = await Promise.all([
      submitEscrowTransaction(input),
      submitEscrowTransaction(input)
    ]);

    expect(results.every((result) => result.txSig === input.txSig)).toBe(true);
    expect(results.every((result) => result.status === "submitted")).toBe(true);
  });
});
