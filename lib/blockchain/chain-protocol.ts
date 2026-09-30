import { createHash } from "node:crypto";
import {
  Connection,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import type { EscrowTransactionKind } from "@prisma/client";
import {
  encodeAnchorInstruction,
  encodeAnchorString,
  encodeU64,
} from "./anchor-encoding";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  deriveDisputePolicyPda,
  deriveMilestoneReleaseReceiptPda,
  deriveSolanaEscrowAccounts,
  hashMilestoneId,
  deriveMilestonePlanPda,
} from "./solana-escrow-accounts";
import {
  createInitializeEscrowInstruction,
  createInitializeEscrowWithArbitratorInstruction,
  createMarkFundedInstruction,
  createReleaseMilestoneInstruction,
} from "./solana-escrow-instructions";
import { ServiceError } from "@/lib/services/errors";

export const digest = (bytes: Uint8Array | string) =>
  createHash("sha256").update(bytes).digest("hex");
export class ChainReviewError extends ServiceError {
  constructor(
    public code: string,
    public evidence: Record<string, string> = {},
  ) {
    super(`Chain review required: ${code}`, 409);
  }
}
export type ChainContext = {
  contractId: string;
  milestoneId?: string;
  creator: string;
  worker: string;
  actor: string;
  policy: "bilateral" | "arbitrator";
  arbitrator: string | null;
  programId: string;
  mint: string;
  genesisHash: string;
  programHash: string;
  kind: EscrowTransactionKind;
  amount: string;
  reason?: string;
  reasonHash?: string;
  version: string;
  outcome?: "release_to_worker" | "refund_to_creator";
  fundingStage?: "initialize_and_fund" | "fund_existing_initialized";
  funded: string;
  released: string;
  refunded: string;
  businessRevision?: string;
  addressScheme?: "creator" | "legacy";
  milestones?: { id: string; amountUnits: string }[];
};
export function chainConfig() {
  if (
    !process.env.NEXT_PUBLIC_SOLANA_RPC_URL ||
    !process.env.ESCROW_PROGRAM_ID ||
    !process.env.NEXT_PUBLIC_USDC_MINT
  )
    throw new ServiceError("Chain configuration is unavailable", 503);
  return {
    connection: new Connection(
      process.env.NEXT_PUBLIC_SOLANA_RPC_URL,
      "finalized",
    ),
    programId: new PublicKey(process.env.ESCROW_PROGRAM_ID),
    mint: new PublicKey(process.env.NEXT_PUBLIC_USDC_MINT),
  };
}
export async function readProgramHash(
  connection: Connection,
  programId: PublicKey,
) {
  const program = await connection.getAccountInfo(programId, "finalized");
  if (!program?.executable)
    throw new ServiceError("Escrow program is unavailable", 503);
  let bytes = program.data;
  // Upgradeable loader Program account points at ProgramData, with a 45-byte metadata header.
  if (
    program.owner.toBase58() === "BPFLoaderUpgradeab1e11111111111111111111111"
  ) {
    if (bytes.readUInt32LE(0) !== 2)
      throw new ServiceError("Unsupported program layout", 503);
    const data = await connection.getAccountInfo(
      new PublicKey(bytes.subarray(4, 36)),
      "finalized",
    );
    if (
      !data ||
      !data.owner.equals(program.owner) ||
      data.data.readUInt32LE(0) !== 3
    )
      throw new ServiceError("Program data unavailable", 503);
    bytes = data.data.subarray(45);
  }
  return digest(bytes);
}
export async function chainIdentity() {
  const config = chainConfig();
  const genesisHash = await config.connection.getGenesisHash();
  const programHash = await readProgramHash(
    config.connection,
    config.programId,
  );
  if (
    !process.env.ESCROW_NETWORK_GENESIS_HASH ||
    genesisHash !== process.env.ESCROW_NETWORK_GENESIS_HASH ||
    !process.env.ESCROW_PROGRAM_SHA256 ||
    programHash !== process.env.ESCROW_PROGRAM_SHA256
  )
    throw new ServiceError(
      "Network or escrow program version is not approved",
      503,
    );
  const mint = await config.connection.getAccountInfo(config.mint, "finalized");
  if (
    !mint ||
    !mint.owner.equals(TOKEN_PROGRAM_ID) ||
    mint.data.length !== 82 ||
    mint.data[44] !== 6 ||
    mint.data[45] !== 1
  )
    throw new ServiceError(
      "A classic initialized USDC mint with six decimals is required",
      503,
    );
  return { ...config, genesisHash, programHash };
}
export function assertChainContextIdentity(c: ChainContext, identity: { genesisHash: string; programHash: string; programId: PublicKey; mint: PublicKey }) {
  if (c.genesisHash !== identity.genesisHash || c.programHash !== identity.programHash ||
      c.programId !== identity.programId.toBase58() || c.mint !== identity.mint.toBase58())
    throw new ChainReviewError("OPERATION_CHAIN_IDENTITY_CHANGED");
}
export async function disputeCapability() {
  if (
    process.env.ESCROW_CHAIN_DISPUTES_ENABLED !== "true" ||
    process.env.NEXT_PUBLIC_SOLANA_NETWORK !== "localnet"
  )
    return false;
  try {
    await chainIdentity();
    return true;
  } catch {
    return false;
  }
}
export function contextAccounts(c: ChainContext) {
  return deriveSolanaEscrowAccounts({
    contractId: c.contractId,
    creator: new PublicKey(c.creator),
    worker: new PublicKey(c.worker),
    programId: new PublicKey(c.programId),
    usdcMint: new PublicKey(c.mint),
    // Contexts persisted before namespace versioning encode legacy addresses.
    addressScheme: c.addressScheme ?? "legacy",
  });
}
export function disputeAddress(c: ChainContext) {
  return PublicKey.findProgramAddressSync(
    [
      Buffer.from("dispute"),
      contextAccounts(c).escrowPda.toBuffer(),
      hashMilestoneId(c.milestoneId!),
    ],
    new PublicKey(c.programId),
  )[0];
}
export function protocolInstruction(c: ChainContext, initialize = false, historical = false) {
  const programId = new PublicKey(c.programId),
    accounts = contextAccounts(c),
    creator = new PublicKey(c.creator),
    worker = new PublicKey(c.worker),
    actor = new PublicKey(c.actor),
    usdcMint = new PublicKey(c.mint);
  const common = { programId, accounts, creator, worker, usdcMint, milestones: c.milestones, historical };
  if (initialize)
    return c.policy === "arbitrator"
      ? createInitializeEscrowWithArbitratorInstruction({
          ...common,
          contractId: c.contractId,
          totalAmountUnits: BigInt(c.amount),
          arbitrator: new PublicKey(c.arbitrator!),
        })
      : createInitializeEscrowInstruction({
          ...common,
          contractId: c.contractId,
          totalAmountUnits: BigInt(c.amount),
        });
  if (c.kind === "fund")
    return createMarkFundedInstruction({
      ...common,
      amountUnits: BigInt(c.amount),
    });
  if (c.kind === "release")
    return createReleaseMilestoneInstruction({
      ...common,
      milestoneId: c.milestoneId!,
      amountUnits: BigInt(c.amount),
    });
  const escrow = accounts.escrowPda,
    dispute = disputeAddress(c),
    receipt = deriveMilestoneReleaseReceiptPda(
      escrow,
      c.milestoneId!,
      programId,
    ).address;
  const meta = (pubkey: PublicKey, isWritable = false, isSigner = false) => ({
    pubkey,
    isWritable,
    isSigner,
  });
  let name: string, keys: ReturnType<typeof meta>[], args: Buffer[];
  if (c.kind === "dispute_open") {
    name = "open_dispute";
    keys = [
      meta(escrow, true),
      meta(actor, true, true),
      meta(dispute, true),
      meta(receipt),
      meta(SystemProgram.programId),
    ];
    args = [
      encodeAnchorString(c.milestoneId!),
      hashMilestoneId(c.milestoneId!),
      Buffer.from(c.reasonHash!, "hex"),
    ];
  } else if (c.kind === "dispute_propose") {
    name = "propose_resolution";
    keys = [meta(escrow), meta(dispute, true), meta(actor, false, true)];
    args = [
      Buffer.from([c.outcome === "release_to_worker" ? 1 : 2]),
      encodeU64(BigInt(c.outcome === "release_to_worker" ? c.amount : "0")),
      encodeU64(BigInt(c.version)),
    ];
  } else {
    const arbitration = c.kind.includes("arbitrate"),
      release = c.kind.endsWith("release");
    name = `${arbitration ? "arbitrate" : "accept"}_${release ? "release" : "refund"}_resolution`;
    keys = [meta(escrow, true), meta(dispute, true)];
    if (arbitration)
      keys.push(meta(deriveDisputePolicyPda(escrow, programId).address));
    keys.push(
      meta(actor, release, true),
      meta(release ? worker : creator),
      meta(usdcMint),
      meta(accounts.vaultPda, true),
      meta(
        release ? accounts.workerTokenAccount : accounts.creatorTokenAccount,
        true,
      ),
    );
    if (release) keys.push(meta(receipt, true));
    keys.push(meta(TOKEN_PROGRAM_ID));
    if (release) keys.push(meta(SystemProgram.programId));
    args = arbitration
      ? [encodeU64(BigInt(c.amount))]
      : [encodeU64(BigInt(c.version)), encodeU64(BigInt(c.amount))];
  }
  if ((c.kind === "dispute_open" || c.kind === "dispute_propose" || c.kind.endsWith("release")) && !(accounts.addressScheme === "legacy" && historical))
    keys.push(meta(accounts.addressScheme === "legacy" ? programId : deriveMilestonePlanPda(escrow, programId)));
  return new TransactionInstruction({
    programId,
    keys,
    data: encodeAnchorInstruction(name, args),
  });
}
export function associatedTokenInstruction(c: ChainContext) {
  const a = contextAccounts(c),
    release = !c.kind.endsWith("refund"),
    actor = new PublicKey(c.actor);
  return new TransactionInstruction({
    programId: ASSOCIATED_TOKEN_PROGRAM_ID,
    data: Buffer.from([1]),
    keys: [
      { pubkey: actor, isSigner: true, isWritable: true },
      {
        pubkey: release ? a.workerTokenAccount : a.creatorTokenAccount,
        isSigner: false,
        isWritable: true,
      },
      {
        pubkey: new PublicKey(release ? c.worker : c.creator),
        isSigner: false,
        isWritable: false,
      },
      { pubkey: new PublicKey(c.mint), isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
  });
}
export async function buildProtocolTransaction(c: ChainContext) {
  const identity = await chainIdentity();
  assertChainContextIdentity(c, identity);
  const { blockhash, lastValidBlockHeight } =
    await identity.connection.getLatestBlockhash("finalized");
  const transaction = new Transaction({
    feePayer: new PublicKey(c.actor),
    recentBlockhash: blockhash,
  });
  if (c.kind === "fund" && c.fundingStage === "initialize_and_fund")
    transaction.add(protocolInstruction(c, true));
  if (
    c.kind === "release" ||
    (c.kind !== "dispute_open" &&
      c.kind !== "dispute_propose" &&
      c.kind !== "fund")
  )
    transaction.add(associatedTokenInstruction(c));
  transaction.add(protocolInstruction(c));
  return {
    transaction: transaction
      .serialize({ requireAllSignatures: false, verifySignatures: false })
      .toString("base64"),
    messageHash: digest(transaction.serializeMessage()),
    recentBlockhash: blockhash,
    lastValidBlockHeight: BigInt(lastValidBlockHeight),
  };
}
