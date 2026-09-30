// Pre-upgrade account bytes: prove existing principal remains spendable after upgrade.
import { mkdirSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { Keypair, PublicKey, SystemProgram } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync } from "@solana/spl-token";

const directory = process.argv[2];
const accountDirectory = `${directory}/accounts`;
mkdirSync(accountDirectory, { recursive: true });
const program = new PublicKey("ErFsmiKY7WxjD9ArYmpqjCCUKnTcfzLm6tFpmWdFU9ck");
const pda = (...seeds) => PublicKey.findProgramAddressSync(seeds, program);
const discriminator = (name) => createHash("sha256").update(`account:${name}`).digest().subarray(0, 8);
const u64 = (n) => { const bytes = Buffer.alloc(8); bytes.writeBigUInt64LE(BigInt(n)); return bytes; };
function save(key, owner, data) {
  writeFileSync(`${accountDirectory}/${key}.json`, JSON.stringify({ pubkey: key.toBase58(), account: { lamports: 10_000_000_000, data: [data.toString("base64"), "base64"], owner: owner.toBase58(), executable: false, rentEpoch: 0, space: data.length } }));
}
function token(key, mint, owner, amount) {
  const data = Buffer.alloc(165);
  mint.toBuffer().copy(data); owner.toBuffer().copy(data, 32);
  data.writeBigUInt64LE(BigInt(amount), 64); data[108] = 1;
  save(key, TOKEN_PROGRAM_ID, data);
}
const fixtures = [];
for (const mode of ["bilateral", "arbitrator", "unfunded"]) {
  const id = `legacy-${mode}`, creator = Keypair.generate(), worker = Keypair.generate(), arbitrator = Keypair.generate(), mint = Keypair.generate().publicKey;
  for (const actor of [creator, worker, arbitrator]) save(actor.publicKey, SystemProgram.programId, Buffer.alloc(0));
  const [escrow, bump] = pda(Buffer.from("escrow"), Buffer.from(id));
  const [vault, vaultBump] = pda(Buffer.from("vault"), Buffer.from(id));
  const funded = mode !== "unfunded";
  const mintData = Buffer.alloc(82); mintData.writeBigUInt64LE(100n, 36); mintData[44] = 6; mintData[45] = 1;
  save(mint, TOKEN_PROGRAM_ID, mintData);
  const creatorToken = getAssociatedTokenAddressSync(mint, creator.publicKey), workerToken = getAssociatedTokenAddressSync(mint, worker.publicKey);
  token(vault, mint, escrow, funded ? 100 : 0); token(creatorToken, mint, creator.publicKey, funded ? 0 : 100); token(workerToken, mint, worker.publicKey, 0);
  const length = Buffer.alloc(4); length.writeUInt32LE(Buffer.byteLength(id));
  const state = Buffer.concat([discriminator("EscrowState"), length, Buffer.from(id), creator.publicKey.toBuffer(), worker.publicKey.toBuffer(), mint.toBuffer(), vault.toBuffer(), u64(100), u64(funded ? 100 : 0), u64(0), Buffer.from([funded ? 1 : 0, bump, vaultBump])]);
  const padded = Buffer.alloc(199); state.copy(padded); save(escrow, program, padded);
  const [policy, policyBump] = pda(Buffer.from("policy"), escrow.toBuffer());
  if (mode === "arbitrator") save(policy, program, Buffer.concat([discriminator("DisputePolicy"), escrow.toBuffer(), arbitrator.publicKey.toBuffer(), Buffer.from([1, policyBump])]));
  fixtures.push({ mode, id, creator: [...creator.secretKey], worker: [...worker.secretKey], arbitrator: [...arbitrator.secretKey], escrow: escrow.toBase58(), vault: vault.toBase58(), mint: mint.toBase58(), creatorToken: creatorToken.toBase58(), workerToken: workerToken.toBase58(), policy: policy.toBase58() });
}
writeFileSync(`${directory}/manifest.json`, JSON.stringify(fixtures));
