import { createHash } from "node:crypto";
import { Buffer } from "node:buffer";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Connection, PublicKey } from "@solana/web3.js";
import { deriveSolanaEscrowAccounts } from "./solana-escrow-accounts";
import { inspectPreparedFunding, inspectPreparedRelease } from "./solana-escrow-transactions";

const originalEnv = {
  rpc: process.env.NEXT_PUBLIC_SOLANA_RPC_URL,
  program: process.env.ESCROW_PROGRAM_ID,
  mint: process.env.NEXT_PUBLIC_USDC_MINT
};

afterEach(() => {
  vi.restoreAllMocks();
  process.env.NEXT_PUBLIC_SOLANA_RPC_URL = originalEnv.rpc;
  process.env.ESCROW_PROGRAM_ID = originalEnv.program;
  process.env.NEXT_PUBLIC_USDC_MINT = originalEnv.mint;
});

const programId = new PublicKey("ErFsmiKY7WxjD9ArYmpqjCCUKnTcfzLm6tFpmWdFU9ck");
const mint = new PublicKey("4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU");
const creator = new PublicKey("11111111111111111111111111111112");
const worker = new PublicKey("11111111111111111111111111111113");
const contractId = "release-test";
const accounts = deriveSolanaEscrowAccounts({ contractId, programId, usdcMint: mint, creator, worker });

function escrowAccount(releasedAmount: bigint) {
  const name = Buffer.from(contractId);
  const length = Buffer.alloc(4);
  length.writeUInt32LE(name.length);
  const amount = (value: bigint) => {
    const bytes = Buffer.alloc(8);
    bytes.writeBigUInt64LE(value);
    return bytes;
  };
  return {
    owner: programId,
    data: Buffer.concat([
      createHash("sha256").update("account:EscrowState").digest().subarray(0, 8),
      length, name, creator.toBuffer(), worker.toBuffer(), mint.toBuffer(),
      accounts.vaultPda.toBuffer(), amount(BigInt(10_000_000)),
      amount(BigInt(10_000_000)), amount(releasedAmount), Buffer.from([1, 1, 1])
    ])
  } as never;
}

const releaseInput = {
  contractId,
  creatorWallet: creator.toBase58(),
  workerWallet: worker.toBase58(),
  fundedAmount: "10",
  releasedAmountBefore: "2",
  recentBlockhash: "old-hash"
};

function configureRelease() {
  process.env.NEXT_PUBLIC_SOLANA_RPC_URL = "http://localhost:8899";
  process.env.ESCROW_PROGRAM_ID = programId.toBase58();
  process.env.NEXT_PUBLIC_USDC_MINT = mint.toBase58();
}

describe("prepared release inspection", () => {
  it("reuses a valid preparation while the finalized amount is unchanged", async () => {
    configureRelease();
    vi.spyOn(Connection.prototype, "getAccountInfo").mockResolvedValue(escrowAccount(BigInt(2_000_000)));
    vi.spyOn(Connection.prototype, "isBlockhashValid").mockResolvedValue({ context: { slot: 1 }, value: true });
    expect(await inspectPreparedRelease(releaseInput)).toBe("valid");
  });

  it("releases the preparation only after expiry with unchanged finalized amount", async () => {
    configureRelease();
    const account = vi.spyOn(Connection.prototype, "getAccountInfo").mockResolvedValue(escrowAccount(BigInt(2_000_000)));
    vi.spyOn(Connection.prototype, "isBlockhashValid").mockResolvedValue({ context: { slot: 1 }, value: false });
    expect(await inspectPreparedRelease(releaseInput)).toBe("expired_without_release");
    expect(account).toHaveBeenCalledTimes(2);
  });

  it("requires review if the finalized amount advanced without a recorded signature", async () => {
    configureRelease();
    const valid = vi.spyOn(Connection.prototype, "isBlockhashValid");
    vi.spyOn(Connection.prototype, "getAccountInfo").mockResolvedValue(escrowAccount(BigInt(4_000_000)));
    expect(await inspectPreparedRelease(releaseInput)).toBe("review");
    expect(valid).not.toHaveBeenCalled();
  });
});

describe("prepared funding inspection", () => {
  const input = { contractId: "funding-test", recentBlockhash: "old-hash" };

  function configure() {
    process.env.NEXT_PUBLIC_SOLANA_RPC_URL = "http://localhost:8899";
    process.env.ESCROW_PROGRAM_ID = "11111111111111111111111111111111";
    process.env.NEXT_PUBLIC_USDC_MINT = "11111111111111111111111111111111";
  }

  it("keeps a valid preparation after checking account absence", async () => {
    configure();
    vi.spyOn(Connection.prototype, "isBlockhashValid").mockResolvedValue({ context: { slot: 1 }, value: true });
    const account = vi.spyOn(Connection.prototype, "getAccountInfo").mockResolvedValue(null);
    expect(await inspectPreparedFunding(input)).toBe("valid");
    expect(account).toHaveBeenCalledTimes(1);
  });

  it("requires review when an expired preparation has an escrow account", async () => {
    configure();
    const valid = vi.spyOn(Connection.prototype, "isBlockhashValid");
    vi.spyOn(Connection.prototype, "getAccountInfo").mockResolvedValue({} as never);
    expect(await inspectPreparedFunding(input)).toBe("review");
    expect(valid).not.toHaveBeenCalled();
  });

  it("allows expiry only when the finalized escrow account is absent", async () => {
    configure();
    vi.spyOn(Connection.prototype, "isBlockhashValid").mockResolvedValue({ context: { slot: 1 }, value: false });
    const account = vi.spyOn(Connection.prototype, "getAccountInfo").mockResolvedValue(null);
    expect(await inspectPreparedFunding(input)).toBe("expired_without_escrow");
    expect(account).toHaveBeenCalledWith(expect.anything(), "finalized");
  });
});
