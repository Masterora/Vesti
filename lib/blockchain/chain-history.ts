import { ServiceError } from "@/lib/services/errors";
import {
  PublicKey,
  SystemProgram,
  Transaction,
  type VersionedTransactionResponse,
} from "@solana/web3.js";
import bs58 from "bs58";
import { encodeAnchorInstruction } from "./anchor-encoding";
import { decodeEscrowStateAccount } from "./solana-escrow-reconciliation";
import {
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  hashMilestoneId,
  deriveDisputePolicyPda,
  deriveMilestoneReleaseReceiptPda,
  deriveMilestonePlanPda,
} from "./solana-escrow-accounts";
import {
  chainIdentity,
  contextAccounts,
  disputeAddress,
  protocolInstruction,
  associatedTokenInstruction,
  digest,
  ChainReviewError,
  assertChainContextIdentity,
  type ChainContext,
} from "./chain-protocol";

export type ChainInstructionEvidence = {
  txSig: string;
  slot: bigint;
  transactionIndex: number;
  instructionIndex: number;
  kind: string;
  context: ChainContext;
  evidenceHash: string;
};
export type ReplayDispute = {
  context: ChainContext;
  openedBy: string;
  reasonHash: string;
  version: bigint;
  state: number;
  proposer: string | null;
  outcome: ChainContext["outcome"];
  amount: bigint;
  settled: bigint;
  resolvedBy: string | null;
};
export type ChainSnapshot = {
  businessRevision?: bigint;
  identity: Awaited<ReturnType<typeof chainIdentity>>;
  instructions: ChainInstructionEvidence[];
  baseline: "absent" | "initialized" | "funded";
  slot: bigint;
  funded: bigint;
  released: bigint;
  refunded: bigint;
  status: number;
  disputes: Map<string, ReplayDispute>;
  receipts: Map<string, bigint>;
  extra: bigint;
  head: string | null;
};
function fail(code: string, txSig?: string): never {
  throw new ChainReviewError(code, txSig ? { txSig } : {});
}
const nameOf = (data: Buffer) =>
  [
    "initialize_escrow_v2",
    "initialize_escrow_with_arbitrator_v2",
    "initialize_escrow",
    "initialize_escrow_with_arbitrator",
    "mark_funded",
    "release_milestone",
    "open_dispute",
    "propose_resolution",
    "accept_release_resolution",
    "accept_refund_resolution",
    "arbitrate_release_resolution",
    "arbitrate_refund_resolution",
  ].find((name) =>
    data.subarray(0, 8).equals(encodeAnchorInstruction(name, [])),
  );

/** Resolve loaded keys before determining relevance; v0 is not itself suspicious. */
export function hasEscrowInvocation(response: VersionedTransactionResponse, programId: PublicKey, escrow?: PublicKey) {
  const message = response.transaction.message;
  const keys = "accountKeys" in message ? message.accountKeys : [
    ...message.staticAccountKeys,
    ...(response.meta?.loadedAddresses?.writable ?? []),
    ...(response.meta?.loadedAddresses?.readonly ?? []),
  ];
  const top = "instructions" in message ? message.instructions : message.compiledInstructions;
  const relevant = (ix: { programIdIndex: number; accounts?: number[]; accountKeyIndexes?: number[] }) => {
    if (!keys[ix.programIdIndex]?.equals(programId)) return false;
    if (!escrow) return true;
    const indices = ix.accounts ?? ix.accountKeyIndexes ?? [];
    // Every approved Vesti instruction binds its state at account index zero.
    // Another contract may append this address as an irrelevant remaining account.
    return keys[indices[0]]?.equals(escrow) ?? false;
  };
  const invokes = top.some(relevant);
  const innerInvokes = response.meta?.innerInstructions?.some((group) =>
    group.instructions.some(relevant),
  );
  return { invokes, innerInvokes: Boolean(innerInvokes) };
}

export function isUnallocatedAccount(account: { owner: PublicKey; data: Buffer; executable: boolean } | null) {
  return !account || (account.owner.equals(SystemProgram.programId) && !account.executable && account.data.length === 0);
}
function anchorString(data: Buffer, offset: number) {
  const length = data.readUInt32LE(offset);
  if (length > 64 || offset + 4 + length > data.length)
    fail("INVALID_INSTRUCTION_STRING");
  return {
    value: data.subarray(offset + 4, offset + 4 + length).toString("utf8"),
    end: offset + 4 + length,
  };
}

export function verifyTokenMovement(
  response: VersionedTransactionResponse,
  c: ChainContext,
) {
  if (!response.meta || !("accountKeys" in response.transaction.message))
    fail("MISSING_TOKEN_METADATA");
  const keys = response.transaction.message.accountKeys,
    a = contextAccounts(c);
  const refund = c.kind.endsWith("refund"),
    fund = c.kind === "fund";
  const source = fund ? a.creatorTokenAccount : a.vaultPda,
    destination = fund
      ? a.vaultPda
      : refund
        ? a.creatorTokenAccount
        : a.workerTokenAccount;
  const balances = (
    list: typeof response.meta.preTokenBalances,
    address: PublicKey,
    owner: string,
  ) => {
    const balance = list?.find((b) => keys[b.accountIndex]?.equals(address));
    if (!balance) return 0n;
    if (
      balance.mint !== c.mint ||
      balance.owner !== owner ||
      balance.programId !== TOKEN_PROGRAM_ID.toBase58() ||
      balance.uiTokenAmount.decimals !== 6
    )
      fail("INVALID_TOKEN_BINDING");
    return BigInt(balance.uiTokenAmount.amount);
  };
  if (!response.meta.preTokenBalances || !response.meta.postTokenBalances)
    fail("MISSING_TOKEN_METADATA");
  const sourceOwner = fund ? c.creator : a.escrowPda.toBase58(),
    destinationOwner = fund
      ? a.escrowPda.toBase58()
      : refund
        ? c.creator
        : c.worker;
  const sourceDelta =
    balances(response.meta.preTokenBalances, source, sourceOwner) -
    balances(response.meta.postTokenBalances, source, sourceOwner);
  const destinationDelta =
    balances(response.meta.postTokenBalances, destination, destinationOwner) -
    balances(response.meta.preTokenBalances, destination, destinationOwner);
  if (sourceDelta !== BigInt(c.amount) || destinationDelta !== BigInt(c.amount))
    fail("TOKEN_MOVEMENT_MISMATCH");
  const transfers = (response.meta.innerInstructions ?? [])
    .flatMap((g) => g.instructions)
    .filter(
      (ix) =>
        keys[ix.programIdIndex]?.equals(TOKEN_PROGRAM_ID) &&
        bs58.decode(ix.data)[0] === 12,
    );
  if (transfers.length !== 1) fail("TOKEN_CPI_MISMATCH");
  const ix = transfers[0],
    data = Buffer.from(bs58.decode(ix.data));
  if (
    data.length !== 10 ||
    data.readBigUInt64LE(1) !== BigInt(c.amount) ||
    data[9] !== 6 ||
    ix.accounts.length !== 4 ||
    !keys[ix.accounts[0]]?.equals(source) ||
    !keys[ix.accounts[1]]?.equals(new PublicKey(c.mint)) ||
    !keys[ix.accounts[2]]?.equals(destination) ||
    keys[ix.accounts[3]]?.toBase58() !== sourceOwner
  )
    fail("TOKEN_CPI_MISMATCH");
}

export async function readChainHistory(
  base: ChainContext,
  milestoneIds: string[],
): Promise<ChainSnapshot> {
  const identity = await chainIdentity(),
    { connection, programId } = identity;
  assertChainContextIdentity(base, identity);
  const accounts = contextAccounts(base);
  // Scan from the initial account creation; bounded pagination must reach the end.
  const scan = async () => {
    const all: Awaited<ReturnType<typeof connection.getSignaturesForAddress>> =
      [];
    let before: string | undefined;
    for (let page = 0; page < 20; page++) {
      const batch = await connection.getSignaturesForAddress(
        accounts.escrowPda,
        { limit: 1000, before },
        "finalized",
      );
      all.push(...batch);
      if (batch.length < 1000) return all;
      before = batch.at(-1)!.signature;
    }
    fail("HISTORY_SCAN_LIMIT");
  };
  const signatures = await scan();
  let funded = 0n,
    released = 0n,
    refunded = 0n,
    status = -1;
  const instructions: ChainInstructionEvidence[] = [],
    disputes = new Map<string, ReplayDispute>(),
    receipts = new Map<string, bigint>();
  const entries: {
    response: VersionedTransactionResponse;
    txSig: string;
    index: number;
  }[] = [];
  const blocks = new Map<number, { signatures: string[] } | null>();
  for (const signature of signatures) {
    if (signature.err) continue;
    const response = await connection.getTransaction(signature.signature, {
      commitment: "finalized",
      maxSupportedTransactionVersion: 0,
    });
    if (!response?.meta)
      fail("HISTORY_TRANSACTION_MISSING", signature.signature);
    if (response.meta.err) continue;
    const { invokes, innerInvokes } = hasEscrowInvocation(response, programId, accounts.escrowPda);
    if (innerInvokes) fail("UNKNOWN_ESCROW_CPI", signature.signature);
    if (!invokes) {
      // Only this program can mutate its state. Token principal, receipts and
      // bindings are independently checked against the complete replay below.
      // A writable reference or SOL donation is not evidence of escrow mutation.
      continue;
    }
    if (!("accountKeys" in response.transaction.message))
      fail("VERSIONED_ENVELOPE_UNSUPPORTED", signature.signature);
    let block = blocks.get(response.slot);
    if (!block) {
      const full = await connection.getBlock(response.slot, {
        commitment: "finalized",
        transactionDetails: "full",
        maxSupportedTransactionVersion: 0,
      });
      block = full
        ? {
            signatures: full.transactions.map(
              (t) => t.transaction.signatures[0],
            ),
          }
        : null;
      blocks.set(response.slot, block);
    }
    const index = block?.signatures?.indexOf(signature.signature) ?? -1;
    if (index < 0) fail("HISTORY_ORDER_MISSING", signature.signature);
    entries.push({ response, txSig: signature.signature, index });
  }
  entries.sort(
    (a, b) => a.response.slot - b.response.slot || a.index - b.index,
  );
  for (const { response, txSig, index } of entries) {
    const message = response.transaction.message;
    if (!("accountKeys" in message)) fail("VERSIONED_ENVELOPE_UNSUPPORTED");
    const programInstructions = message.instructions
      .map((ix, instructionIndex) => ({ ix, instructionIndex }))
      .filter(({ ix }) =>
        message.accountKeys[ix.programIdIndex].equals(programId) && message.accountKeys[ix.accounts[0]]?.equals(accounts.escrowPda),
      );
    const names = programInstructions.map(({ ix }) =>
      nameOf(Buffer.from(bs58.decode(ix.data))),
    );
    if (names.some((n) => !n)) fail("UNKNOWN_ESCROW_INSTRUCTION", txSig);
    if (
      programInstructions.length > 1 &&
      !(
        names.length === 2 &&
        names[0]?.startsWith("initialize_escrow") &&
        names[1] === "mark_funded"
      )
    )
      fail("COMPOUND_ESCROW_TRANSACTION", txSig);
    const allowedOther = new Set<string>([
      ASSOCIATED_TOKEN_PROGRAM_ID.toBase58(),
    ]);
    for (const ix of message.instructions)
      if (
        !message.accountKeys[ix.programIdIndex].equals(programId) &&
        !allowedOther.has(message.accountKeys[ix.programIdIndex].toBase58())
      )
        fail("UNKNOWN_ENVELOPE", txSig);
    // Internal CPI may only come from the program, System, ATA, or classic Token.
    for (const group of response.meta!.innerInstructions ?? [])
      for (const ix of group.instructions) {
        if (
          ![
            "11111111111111111111111111111111",
            TOKEN_PROGRAM_ID.toBase58(),
            ASSOCIATED_TOKEN_PROGRAM_ID.toBase58(),
          ].includes(message.accountKeys[ix.programIdIndex].toBase58())
        )
          fail("UNKNOWN_INNER_PROGRAM", txSig);
      }
    for (const { ix, instructionIndex } of programInstructions) {
      const data = Buffer.from(bs58.decode(ix.data)),
        name = nameOf(data)!;
      const c: ChainContext = {
        ...base,
        actor: "",
        funded: funded.toString(),
        released: released.toString(),
        refunded: refunded.toString(),
        amount: "0",
        version: "0",
      };
      let initialize = false;
      if (name.startsWith("initialize_escrow")) {
        if (status !== -1) fail("DUPLICATE_INITIALIZATION", txSig);
        const id = anchorString(data, 8),
          worker = new PublicKey(data.subarray(id.end, id.end + 32)).toBase58();
        const amount = data.readBigUInt64LE(id.end + 32);
        if (
          id.value !== base.contractId ||
          worker !== base.worker ||
          amount !== BigInt(base.amount)
        )
          fail("INITIALIZATION_BINDING_MISMATCH", txSig);
        if (name.includes("with_arbitrator") !== (base.policy === "arbitrator"))
          fail("POLICY_MISMATCH", txSig);
        if (
          base.policy === "arbitrator" &&
          new PublicKey(data.subarray(id.end + 40, id.end + 72)).toBase58() !==
            base.arbitrator
        )
          fail("POLICY_MISMATCH", txSig);
        c.actor = base.creator;
        c.kind = "fund";
        c.amount = base.amount;
        initialize = true;
        status = 0;
      } else if (name === "mark_funded") {
        if (status !== 0 || data.readBigUInt64LE(8) !== BigInt(base.amount))
          fail("INVALID_FUNDING", txSig);
        c.actor = base.creator;
        c.kind = "fund";
        c.amount = base.amount;
        verifyTokenMovement(response, c);
        funded = BigInt(c.amount);
        status = 1;
      } else if (name === "release_milestone" || name === "open_dispute") {
        const id = anchorString(data, 8);
        c.milestoneId = id.value;
        if (!milestoneIds.includes(id.value)) fail("UNKNOWN_MILESTONE", txSig);
        c.actor = message.accountKeys[ix.accounts[1]].toBase58();
        if (status !== 1 || receipts.has(id.value))
          fail("INVALID_MILESTONE_STATE", txSig);
        if (name === "release_milestone") {
          c.kind = "release";
          c.amount = data.readBigUInt64LE(id.end).toString();
          verifyTokenMovement(response, c);
          released += BigInt(c.amount);
          receipts.set(id.value, BigInt(c.amount));
          status = released === funded ? 3 : 1;
        } else {
          c.kind = "dispute_open";
          c.reasonHash = data
            .subarray(id.end + 32, id.end + 64)
            .toString("hex");
          if (
            disputes.has(id.value) ||
            ![base.creator, base.worker].includes(c.actor)
          )
            fail("INVALID_DISPUTE", txSig);
          disputes.set(id.value, {
            context: c,
            openedBy: c.actor,
            reasonHash: c.reasonHash,
            version: 0n,
            state: 0,
            proposer: null,
            outcome: undefined,
            amount: 0n,
            settled: 0n,
            resolvedBy: null,
          });
          status = 2;
        }
      } else {
        const address = message.accountKeys[ix.accounts[1]].toBase58();
        const pair = [...disputes].find(
          ([, d]) => disputeAddress(d.context).toBase58() === address,
        );
        if (!pair || status !== 2 || pair[1].state === 2)
          fail("UNKNOWN_OR_RESOLVED_DISPUTE", txSig);
        const [id, d] = pair;
        c.milestoneId = id;
        const arbitration = name.startsWith("arbitrate");
        c.actor =
          message.accountKeys[ix.accounts[arbitration ? 3 : 2]].toBase58();
        if (name === "propose_resolution") {
          c.kind = "dispute_propose";
          c.outcome =
            data[8] === 1
              ? "release_to_worker"
              : data[8] === 2
                ? "refund_to_creator"
                : undefined;
          if (!c.outcome || ![base.creator, base.worker].includes(c.actor))
            fail("INVALID_PROPOSAL", txSig);
          c.amount = data.readBigUInt64LE(9).toString();
          c.version = data.readBigUInt64LE(17).toString();
          if (
            BigInt(c.version) !== d.version ||
            (c.outcome === "refund_to_creator" && c.amount !== "0")
          )
            fail("PROPOSAL_VERSION_MISMATCH", txSig);
          d.version++;
          d.proposer = c.actor;
          d.outcome = c.outcome;
          d.amount = BigInt(c.amount);
          d.state = 1;
        } else {
          const release = name.includes("_release_");
          c.outcome = release ? "release_to_worker" : "refund_to_creator";
          c.kind = arbitration
            ? release
              ? "dispute_arbitrate_release"
              : "dispute_arbitrate_refund"
            : release
              ? "dispute_accept_release"
              : "dispute_accept_refund";
          c.version = arbitration
            ? d.version.toString()
            : data.readBigUInt64LE(8).toString();
          c.amount = data.readBigUInt64LE(arbitration ? 8 : 16).toString();
          if (arbitration) {
            if (base.policy !== "arbitrator" || c.actor !== base.arbitrator)
              fail("INVALID_ARBITRATOR", txSig);
          } else if (
            d.state !== 1 ||
            d.proposer === c.actor ||
            ![base.creator, base.worker].includes(c.actor) ||
            c.outcome !== d.outcome ||
            BigInt(c.version) !== d.version ||
            (release && BigInt(c.amount) !== d.amount)
          )
            fail("INVALID_ACCEPTANCE", txSig);
          if (!release && BigInt(c.amount) !== funded - released - refunded)
            fail("REFUND_AMOUNT_MISMATCH", txSig);
          verifyTokenMovement(response, c);
          d.state = 2;
          d.outcome = c.outcome;
          d.settled = BigInt(c.amount);
          d.resolvedBy = c.actor;
          if (arbitration) {
            d.amount = release ? BigInt(c.amount) : 0n;
          }
          if (release) {
            released += BigInt(c.amount);
            receipts.set(id, BigInt(c.amount));
            status = released === funded ? 3 : 1;
          } else {
            refunded += BigInt(c.amount);
            status = 4;
          }
        }
      }
      if (
        released + refunded > funded ||
        (c.kind !== "fund" &&
          c.kind !== "dispute_open" &&
          c.kind !== "dispute_propose" &&
          BigInt(c.amount) <= 0n)
      )
        fail("PRINCIPAL_OVERFLOW", txSig);
      // Pre-upgrade legacy history lacks the optional plan-account sentinel.
      let expected = protocolInstruction(c, initialize);
      if (c.addressScheme !== "creator" && ix.accounts.length !== expected.keys.length)
        expected = protocolInstruction(c, initialize, true);
      if (
        !data.equals(expected.data) ||
        ix.accounts.length !== expected.keys.length ||
        ix.accounts.some(
          (n, i) =>
            !message.accountKeys[n].equals(expected.keys[i].pubkey) ||
            (expected.keys[i].isSigner && !message.isAccountSigner(n)) ||
            (expected.keys[i].isWritable && !message.isAccountWritable(n)),
        )
      )
        fail("INSTRUCTION_BINDING_MISMATCH", txSig);
      const other = message.instructions.filter(
        (i) => !message.accountKeys[i.programIdIndex].equals(programId),
      );
      if (other.length > 1) fail("UNKNOWN_ENVELOPE", txSig);
      if (other.length) {
        if (
          ![
            "release",
            "dispute_accept_release",
            "dispute_accept_refund",
            "dispute_arbitrate_release",
            "dispute_arbitrate_refund",
          ].includes(c.kind)
        )
          fail("UNEXPECTED_ATA", txSig);
        const ata = associatedTokenInstruction(c),
          actual = other[0];
        if (
          !Buffer.from(bs58.decode(actual.data)).equals(ata.data) ||
          actual.accounts.length !== ata.keys.length ||
          actual.accounts.some(
            (n, i) => !message.accountKeys[n].equals(ata.keys[i].pubkey),
          )
        )
          fail("ATA_BINDING_MISMATCH", txSig);
      }
      instructions.push({
        txSig,
        slot: BigInt(response.slot),
        transactionIndex: index,
        instructionIndex,
        kind: initialize ? name : c.kind,
        context: c,
        evidenceHash: digest(message.serialize()),
      });
    }
  }
  const head = signatures[0]?.signature ?? null;
  const slot = BigInt(
    Math.max(signatures[0]?.slot ?? 0, await connection.getSlot("finalized")),
  );
  const read = async (address: PublicKey) =>
    connection.getAccountInfoAndContext(address, {
      commitment: "finalized",
      minContextSlot: Number(slot),
    });
  let extra = 0n;
  try {
    const escrow = await read(accounts.escrowPda),
      vault = await read(accounts.vaultPda),
      policy = await read(
        deriveDisputePolicyPda(accounts.escrowPda, programId).address,
      );
    const plan = accounts.addressScheme === "creator" ? await read(deriveMilestonePlanPda(accounts.escrowPda, programId)) : null;
    if (status === -1) {
      if (![escrow.value, vault.value, policy.value, plan?.value ?? null].every(isUnallocatedAccount))
        fail("UNPROVEN_INITIALIZATION");
    } else {
      if (accounts.addressScheme === "creator") {
        const expectedTerms = base.milestones ?? [];
        const data = plan?.value?.data;
        if (!plan?.value?.owner.equals(programId) || !data ||
            !data.subarray(0, 8).equals(Buffer.from(digest("account:MilestonePlan"), "hex").subarray(0, 8)) ||
            !new PublicKey(data.subarray(8, 40)).equals(accounts.escrowPda) ||
            data.readUInt32LE(40) !== expectedTerms.length ||
            expectedTerms.some((m, i) => !data.subarray(44 + i * 40, 76 + i * 40).equals(hashMilestoneId(m.id)) ||
              data.readBigUInt64LE(76 + i * 40) !== BigInt(m.amountUnits)))
          fail("MILESTONE_PLAN_MISMATCH");
      }
      if (!escrow.value?.owner.equals(programId))
        fail("ESCROW_ACCOUNT_MISSING");
      const s = decodeEscrowStateAccount(escrow.value.data);
      if (
        s.contractId !== base.contractId ||
        s.creator !== base.creator ||
        s.worker !== base.worker ||
        s.usdcMint !== base.mint ||
        s.vault !== accounts.vaultPda.toBase58() ||
        s.totalAmount !== BigInt(base.amount) ||
        s.fundedAmount !== funded ||
        s.releasedAmount !== released ||
        s.status !== status
      )
        fail("AGGREGATE_STATE_MISMATCH");
      if (base.policy === "bilateral") {
        if (!isUnallocatedAccount(policy.value)) fail("POLICY_MISMATCH");
      } else {
        const p = policy.value;
        if (
          !p?.owner.equals(programId) ||
          p.data.length < 74 ||
          !p.data
            .subarray(0, 8)
            .equals(
              Buffer.from(digest("account:DisputePolicy"), "hex").subarray(
                0,
                8,
              ),
            ) ||
          !new PublicKey(p.data.subarray(8, 40)).equals(accounts.escrowPda) ||
          new PublicKey(p.data.subarray(40, 72)).toBase58() !==
            base.arbitrator ||
          p.data[72] !== 1
        )
          fail("POLICY_MISMATCH");
      }
      const v = vault.value;
      if (
        !v?.owner.equals(TOKEN_PROGRAM_ID) ||
        v.data.length !== 165 ||
        !new PublicKey(v.data.subarray(0, 32)).equals(identity.mint) ||
        !new PublicKey(v.data.subarray(32, 64)).equals(accounts.escrowPda) ||
        v.data[108] !== 1
      )
        fail("VAULT_BINDING_MISMATCH");
      extra = v.data.readBigUInt64LE(64) - (funded - released - refunded);
      if (extra < 0n) fail("PRINCIPAL_DEFICIT");
    }
    // Read every known PDA, including absent ones, to detect unrecorded state.
    for (const milestoneId of milestoneIds) {
      const c = { ...base, milestoneId };
      const receipt = await read(
          deriveMilestoneReleaseReceiptPda(
            accounts.escrowPda,
            milestoneId,
            programId,
          ).address,
        ),
        dispute = await read(disputeAddress(c));
      const expectedReceipt = receipts.get(milestoneId),
        d = disputes.get(milestoneId);
      if (expectedReceipt !== undefined) {
        const r = receipt.value;
        if (
          !r?.owner.equals(programId) ||
          r.data.length < 80 ||
          !r.data
            .subarray(0, 8)
            .equals(
              Buffer.from(
                digest("account:MilestoneReleaseReceipt"),
                "hex",
              ).subarray(0, 8),
            ) ||
          !new PublicKey(r.data.subarray(8, 40)).equals(accounts.escrowPda) ||
          !r.data.subarray(40, 72).equals(hashMilestoneId(milestoneId)) ||
          r.data.readBigUInt64LE(72) !== expectedReceipt
        )
          fail("RECEIPT_MISMATCH");
      } else if (!isUnallocatedAccount(receipt.value)) fail("UNRECORDED_RECEIPT");
      if (d) {
        const p = dispute.value?.data;
        if (
          !dispute.value?.owner.equals(programId) ||
          !p ||
          p.length < 227 ||
          !p
            .subarray(0, 8)
            .equals(
              Buffer.from(digest("account:DisputeState"), "hex").subarray(0, 8),
            ) ||
          !new PublicKey(p.subarray(8, 40)).equals(accounts.escrowPda) ||
          !p.subarray(40, 72).equals(hashMilestoneId(milestoneId)) ||
          p.subarray(72, 104).toString("hex") !== d.reasonHash ||
          new PublicKey(p.subarray(104, 136)).toBase58() !== d.openedBy ||
          p[136] !== d.state ||
          p.readBigUInt64LE(178) !== d.version ||
          p.readBigUInt64LE(186) !== d.settled ||
          p.readBigUInt64LE(170) !== d.amount ||
          p[169] !==
            (!d.outcome ? 0 : d.outcome === "release_to_worker" ? 1 : 2) ||
          (d.proposer &&
            new PublicKey(p.subarray(137, 169)).toBase58() !== d.proposer) ||
          (d.resolvedBy &&
            new PublicKey(p.subarray(194, 226)).toBase58() !== d.resolvedBy)
        )
          fail("DISPUTE_ACCOUNT_MISMATCH");
      } else if (!isUnallocatedAccount(dispute.value)) fail("UNRECORDED_DISPUTE");
    }
  } catch (error) {
    const observed = await scan();
    if ((observed[0]?.signature ?? null) !== head)
      throw new ServiceErrorForUnstableChain();
    throw error;
  }
  const endIdentity = await chainIdentity();
  if (
    endIdentity.programHash !== identity.programHash ||
    endIdentity.genesisHash !== identity.genesisHash
  )
    fail("CHAIN_IDENTITY_CHANGED");
  const end = await scan();
  if ((end[0]?.signature ?? null) !== head)
    throw new ServiceErrorForUnstableChain();
  return {
    identity,
    instructions,
    baseline:
      status === -1 ? "absent" : status === 0 ? "initialized" : "funded",
    slot,
    funded,
    released,
    refunded,
    status,
    disputes,
    receipts,
    extra,
    head,
  };
}
class ServiceErrorForUnstableChain extends Error {
  constructor() {
    super("Finalized chain changed during synchronization; retry");
  }
}

export function verifySignedMessage(
  prepared: string,
  signed: string,
  wallet: string,
) {
  try {
    const original = Transaction.from(Buffer.from(prepared, "base64")),
      transaction = Transaction.from(Buffer.from(signed, "base64"));
    if (
      !transaction.serializeMessage().equals(original.serializeMessage()) ||
      transaction.feePayer?.toBase58() !== wallet ||
      transaction.signatures.length !== 1 ||
      transaction.signatures[0].publicKey.toBase58() !== wallet ||
      !transaction.verifySignatures()
    )
      throw new ChainReviewError("SIGNED_MESSAGE_MISMATCH");
    const bytes = transaction.serialize();
    return {
      txSig: bs58.encode(transaction.signature!),
      signedTransaction: bytes.toString("base64"),
      messageHash: digest(transaction.serializeMessage()),
    };
  } catch {
    throw new ServiceError(
      "Signed transaction differs from the prepared message or has invalid signatures",
      422,
      "SIGNED_MESSAGE_MISMATCH",
    );
  }
}
