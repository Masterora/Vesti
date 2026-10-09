import { describe, it, expect, vi, afterEach } from "vitest";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { inventoryChainRelease } from "./release-inventory";
import { digest } from "./chain-protocol";
import { deriveSolanaEscrowAccounts, TOKEN_PROGRAM_ID } from "./solana-escrow-accounts";
const program = Keypair.generate().publicKey, approvedMint = Keypair.generate().publicKey;
vi.mock("@/lib/db", () => ({ db: { contract: { findMany: async () => [] } } }));
vi.mock("./release-manifest", async (original) => ({ ...await original<object>(), configuredRelease: () => ({ manifest: { releaseId: "r", genesisHash: "g", programId: program.toBase58(), mint: { address: approvedMint.toBase58() } }, manifestSha256: "h" }) }));
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });
function setup() {
  vi.stubEnv("ESCROW_PROGRAM_ID", program.toBase58()); vi.stubEnv("NEXT_PUBLIC_USDC_MINT", approvedMint.toBase58()); vi.stubEnv("NEXT_PUBLIC_SOLANA_RPC_URL", "http://127.0.0.1:8899");
  vi.spyOn(Connection.prototype, "getGenesisHash").mockResolvedValue("g");
}
function account(data: Buffer, owner: PublicKey) { return { data, owner, lamports: 1, executable: false, rentEpoch: 0 }; }
describe("full program inventory", () => {
  it("retains unknown program accounts and never treats RPC success as complete", async () => {
    setup(); const address = Keypair.generate().publicKey;
    const query = vi.spyOn(Connection.prototype, "getProgramAccounts").mockResolvedValue({ context: { slot: 99 }, value: [{ pubkey: address, account: account(Buffer.alloc(12), program) }] } as never);
    const report = await inventoryChainRelease();
    expect(query.mock.calls[0][1]).toEqual({ commitment: "finalized", withContext: true });
    expect(report.accounts[0].address).toBe(address.toBase58()); expect(report.accounts[0].layout).toBe("unknown");
    expect(report.compatible).toBe(false); expect(report.countStatus).toBe("unattested");
  });
  it.each([false, true])("includes unbound other-Mint escrows and blocks Token-2022=%s", async (token2022) => {
    setup(); const creator = Keypair.generate().publicKey, worker = Keypair.generate().publicKey, mint = Keypair.generate().publicKey;
    const a = deriveSolanaEscrowAccounts({ contractId: "outside-db", programId: program, usdcMint: mint, creator, worker });
    const state = Buffer.alloc(199); Buffer.from(digest("account:EscrowState"), "hex").copy(state, 0, 0, 8);
    const id = Buffer.from("outside-db"); state.writeUInt32LE(id.length, 8); id.copy(state, 12); let offset = 12 + id.length;
    for (const key of [creator, worker, mint, a.vaultPda]) { key.toBuffer().copy(state, offset); offset += 32; }
    state.writeBigUInt64LE(1000000n, offset); state.writeBigUInt64LE(1000000n, offset + 8); state[offset + 24] = 1; state[offset + 25] = a.escrowBump; state[offset + 26] = a.vaultBump;
    const mintData = Buffer.alloc(82); mintData[44] = 6; mintData[45] = 1;
    const vault = Buffer.alloc(165); mint.toBuffer().copy(vault, 0); a.escrowPda.toBuffer().copy(vault, 32); vault.writeBigUInt64LE(1000000n, 64); vault[108] = 1;
    const token = token2022 ? new PublicKey("TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb") : TOKEN_PROGRAM_ID;
    vi.spyOn(Connection.prototype, "getProgramAccounts").mockResolvedValue({ context: { slot: 99 }, value: [{ pubkey: a.escrowPda, account: account(state, program) }] } as never);
    vi.spyOn(Connection.prototype, "getMultipleAccountsInfo").mockResolvedValue([account(mintData, token), account(vault, token)]);
    const report = await inventoryChainRelease(); expect(report.accounts).toHaveLength(1);
    expect(report.accounts[0].details).toMatchObject({ approvedMint: false, bound: false, tokenProgram: token.toBase58() });
    expect(report.compatible).toBe(!token2022);
  });
});
