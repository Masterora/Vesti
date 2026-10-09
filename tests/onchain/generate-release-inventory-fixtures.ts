import { Keypair, PublicKey } from "@solana/web3.js";
import { mkdirSync, writeFileSync } from "node:fs";
import { digest } from "../../lib/blockchain/chain-protocol";
import { deriveSolanaEscrowAccounts } from "../../lib/blockchain/solana-escrow-accounts";
export function generateReleaseInventoryFixtures(root: string, programId: PublicKey) {
  const creator = Keypair.generate(), worker = Keypair.generate(), mint = Keypair.generate();
  const accounts = deriveSolanaEscrowAccounts({ contractId: "old-token2022", creator: creator.publicKey, worker: worker.publicKey, usdcMint: mint.publicKey, programId });
  mkdirSync(`${root}/accounts`);
  const put = (key: PublicKey, owner: PublicKey, data: Buffer) => writeFileSync(`${root}/accounts/${key.toBase58()}.json`, JSON.stringify({ pubkey: key.toBase58(), account: { lamports: 10000000, data: [data.toString("base64"), "base64"], owner: owner.toBase58(), executable: false, rentEpoch: 0, space: data.length } }));
  const state = Buffer.alloc(199), id = Buffer.from("old-token2022"); Buffer.from(digest("account:EscrowState"), "hex").copy(state, 0, 0, 8); state.writeUInt32LE(id.length, 8); id.copy(state, 12);
  let offset = 12 + id.length; for (const key of [creator.publicKey, worker.publicKey, mint.publicKey, accounts.vaultPda]) { key.toBuffer().copy(state, offset); offset += 32; }
  state.writeBigUInt64LE(1000000n, offset); state.writeBigUInt64LE(1000000n, offset + 8); state[offset + 24] = 1; state[offset + 25] = accounts.escrowBump; state[offset + 26] = accounts.vaultBump;
  put(accounts.escrowPda, programId, state);
  const vault = Buffer.alloc(165); mint.publicKey.toBuffer().copy(vault, 0); accounts.escrowPda.toBuffer().copy(vault, 32); vault[108] = 1;
  put(accounts.vaultPda, new PublicKey("TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"), vault);
  put(Keypair.generate().publicKey, programId, Buffer.alloc(17));
  const path = `${root}/inventory-wallets.json`; writeFileSync(path, JSON.stringify({ creator: [...creator.secretKey], worker: [...worker.secretKey], mint: [...mint.secretKey] }), { mode: 0o600 }); return path;
}
