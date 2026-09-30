import { mkdir, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Connection, Keypair, PublicKey, Transaction, SystemProgram, TransactionMessage, VersionedTransaction } from "@solana/web3.js";
import {
  createMint,
  createAssociatedTokenAccount,
  mintTo,
  getAccount,
  transfer,
} from "@solana/spl-token";
import { db } from "../../lib/db";
import { createContract } from "../../lib/services/contracts/create-contract";
import {
  prepareChainOperation,
  recordSignedOperation,
  recoverChainOperation,
} from "../../lib/services/transactions/chain-operations";
import { syncContractChain } from "../../lib/services/transactions/chain-sync";
import { confirmChainOperation } from "../../lib/services/transactions/confirm-chain-operation";
import {
  digest,
  readProgramHash,
  contextAccounts,
  protocolInstruction,
  type ChainContext,
} from "../../lib/blockchain/chain-protocol";
import { submitMilestoneProof } from "../../lib/services/milestones/submit-milestone-proof";
import { approveMilestone } from "../../lib/services/milestones/approve-milestone";
import type { EscrowTransactionKind } from "@prisma/client";

const connection = new Connection(process.env.VESTI_TEST_RPC_URL!, "finalized");
const programId = new PublicKey("ErFsmiKY7WxjD9ArYmpqjCCUKnTcfzLm6tFpmWdFU9ck");
const creator = Keypair.generate(),
  worker = Keypair.generate(),
  arbitrator = Keypair.generate();
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const evidence: unknown[] = [];
async function waitFinal(signature: string) {
  for (let attempt = 0; attempt < 100; attempt++) {
    const status = (
      await connection.getSignatureStatuses([signature], {
        searchTransactionHistory: true,
      })
    ).value[0];
    if (status?.err) throw new Error(JSON.stringify(status.err));
    if (status?.confirmationStatus === "finalized") return;
    await delay(500);
  }
  throw new Error("Finality timed out");
}
async function sendDirect(transaction: Transaction, actor: Keypair) {
  transaction.feePayer = actor.publicKey;
  transaction.recentBlockhash = (
    await connection.getLatestBlockhash("confirmed")
  ).blockhash;
  transaction.sign(actor);
  const signature = await connection.sendRawTransaction(
    transaction.serialize(),
    { preflightCommitment: "confirmed" },
  );
  await waitFinal(signature);
  return signature;
}
async function execute(
  contractId: string,
  milestoneId: string | undefined,
  kind: EscrowTransactionKind,
  actor: Keypair,
  extra: Record<string, string> = {},
  broadcast = true,
) {
  const input = {
    contractId,
    milestoneId,
    kind,
    walletAddress: actor.publicKey.toBase58(),
    idempotencyKey: randomUUID(),
    ...extra,
  };
  const prepared = await prepareChainOperation(input);
  assert.ok(prepared.transaction);
  assert.ok(prepared.transactionId);
  const transaction = Transaction.from(
    Buffer.from(prepared.transaction, "base64"),
  );
  transaction.sign(actor);
  const signed = await recordSignedOperation({
    transactionId: prepared.transactionId,
    walletAddress: input.walletAddress,
    signedTransaction: transaction.serialize().toString("base64"),
  });
  assert.ok(signed.txSig);
  await assert.rejects(
    recordSignedOperation({
      transactionId: prepared.transactionId,
      walletAddress: (actor === worker ? creator : worker).publicKey.toBase58(),
      signedTransaction: transaction.serialize().toString("base64"),
    }),
    /another wallet/,
  );
  if (broadcast) await connection.sendRawTransaction(transaction.serialize());
  else {
    await db.escrowTransaction.update({
      where: { id: prepared.transactionId },
      data: { requiresReviewAt: new Date(), errorCode: "RECONCILIATION_RETRY_LIMIT", reconciliationAttempts: 12, nextAttemptAt: null },
    });
    await confirmChainOperation({ transactionId: prepared.transactionId, contractId, milestoneId, walletAddress: input.walletAddress, txSig: signed.txSig! }, kind);
    const retried = await db.escrowTransaction.findUniqueOrThrow({ where: { id: prepared.transactionId } });
    assert.equal(retried.requiresReviewAt, null);
    assert.equal(retried.reconciliationAttempts, 0);
    assert.ok(retried.nextAttemptAt);
    console.log("PASS signed owner retry requeues capped transaction before finality");
  }
  // A confirmed transaction cannot change business state before finality.
  const before = await db.escrowTransaction.findUniqueOrThrow({
    where: { id: prepared.transactionId },
  });
  assert.notEqual(before.status, "reconciled");
  await waitFinal(signed.txSig!);
  if (kind === "fund" && !broadcast) {
    const leaseId = randomUUID();
    await db.escrowTransaction.update({
      where: { id: prepared.transactionId },
      data: {
        reconciliationLeaseId: leaseId,
        reconciliationLeaseExpiresAt: new Date(0),
      },
    });
    await assert.rejects(
      recoverChainOperation(prepared.transactionId, leaseId),
      /lease expired/i,
    );
    assert.notEqual(
      (
        await db.escrowTransaction.findUniqueOrThrow({
          where: { id: prepared.transactionId },
        })
      ).status,
      "reconciled",
    );
    console.log(
      "PASS expired worker lease cannot project finalized transaction",
    );
  }
  await recoverChainOperation(prepared.transactionId);
  await recoverChainOperation(prepared.transactionId);
  const result = await db.escrowTransaction.findUniqueOrThrow({
    where: { id: prepared.transactionId },
  });
  assert.equal(result.status, "reconciled");
  assert.equal(result.contractLockKey, null);
  const contract = await db.contract.findUniqueOrThrow({
    where: { id: contractId },
  });
  const accountBindings = contextAccounts(
    result.operationContext as ChainContext,
  );
  evidence.push({
    kind,
    txSig: result.txSig,
    slot: result.finalizedSlot?.toString(),
    contractId,
    F: contract.fundedAmount.toString(),
    R: contract.releasedAmount.toString(),
    Q: contract.refundedAmount.toString(),
    vaultTokenUnits: (
      await getAccount(connection, accountBindings.vaultPda, "finalized")
    ).amount.toString(),
    creatorTokenUnits: (
      await getAccount(
        connection,
        accountBindings.creatorTokenAccount,
        "finalized",
      )
    ).amount.toString(),
    workerTokenUnits: (
      await getAccount(
        connection,
        accountBindings.workerTokenAccount,
        "finalized",
      )
    ).amount.toString(),
    eventCount: await db.event.count({ where: { contractId } }),
  });
  console.log("PASS", kind, result.txSig);
  return result;
}
async function fixture(policy: "bilateral" | "arbitrator", title: string) {
  return createContract({
    creatorWallet: creator.publicKey.toBase58(),
    workerWallet: worker.publicKey.toBase58(),
    disputePolicy: policy,
    arbitratorWallet:
      policy === "arbitrator" ? arbitrator.publicKey.toBase58() : undefined,
    title,
    totalAmount: "10",
    milestones: [{ title: "Delivery", amount: "10" }],
  });
}
async function main() {
  await Promise.all(
    [creator, worker, arbitrator].map(async (wallet) => {
      const sig = await connection.requestAirdrop(
        wallet.publicKey,
        10000000000,
      );
      await waitFinal(sig);
    }),
  );
  console.log("PASS wallet setup");
  const mint = await createMint(
    connection,
    creator,
    creator.publicKey,
    null,
    6,
    undefined,
    { commitment: "confirmed", preflightCommitment: "confirmed" },
  );
  const creatorToken = await createAssociatedTokenAccount(
    connection,
    creator,
    mint,
    creator.publicKey,
    { commitment: "confirmed", preflightCommitment: "confirmed" },
  );
  await createAssociatedTokenAccount(
    connection,
    creator,
    mint,
    worker.publicKey,
    { commitment: "confirmed", preflightCommitment: "confirmed" },
  );
  await mintTo(
    connection,
    creator,
    mint,
    creatorToken,
    creator,
    1000000000,
    [],
    { commitment: "finalized", preflightCommitment: "confirmed" },
  );
  Object.assign(process.env, {
    ESCROW_ADAPTER_MODE: "onchain",
    ESCROW_CHAIN_DISPUTES_ENABLED: "true",
    NEXT_PUBLIC_SOLANA_NETWORK: "localnet",
    NEXT_PUBLIC_SOLANA_RPC_URL: process.env.VESTI_TEST_RPC_URL,
    ESCROW_PROGRAM_ID: programId.toBase58(),
    NEXT_PUBLIC_USDC_MINT: mint.toBase58(),
    ESCROW_NETWORK_GENESIS_HASH: await connection.getGenesisHash(),
    ESCROW_PROGRAM_SHA256: await readProgramHash(connection, programId),
  });
  console.log("PASS approved chain identity and mint setup");
  const balanceBefore = (
    await getAccount(connection, creatorToken, "finalized")
  ).amount;
  if (process.env.VESTI_BROWSER_ONLY !== "1") {
    for (const policy of ["bilateral", "arbitrator"] as const)
      for (const outcome of [
        "release_to_worker",
        "refund_to_creator",
      ] as const) {
        const contract = await fixture(policy, `${policy} ${outcome}`),
          mid = contract.milestones[0].id;
        if (outcome === "release_to_worker") {
          const base = await (await import("../../lib/services/transactions/chain-sync")).baseChainContext(contract.id);
          const accounts = contextAccounts(base);
          const policyAddress = (await import("../../lib/blockchain/solana-escrow-accounts")).deriveDisputePolicyPda(accounts.escrowPda, programId).address;
          const planAddress = (await import("../../lib/blockchain/solana-escrow-accounts")).deriveMilestonePlanPda(accounts.escrowPda, programId);
          await sendDirect(new Transaction().add(...[accounts.escrowPda, accounts.vaultPda, policyAddress, planAddress].map((toPubkey) => SystemProgram.transfer({ fromPubkey: worker.publicKey, toPubkey, lamports: 1_000_000 }))), worker);
          await syncContractChain(contract.id);
          console.log("PASS unsolicited prefunding does not block initialization");
        }
        await execute(contract.id, undefined, "fund", creator, {}, false);
        await execute(contract.id, mid, "dispute_open", worker, {
          reason: "Delivery disputed",
        });
        if (policy === "bilateral") {
          await execute(contract.id, mid, "dispute_propose", creator, {
            outcome,
            expectedProposalVersion: "0",
          });
          await assert.rejects(
            prepareChainOperation({
              contractId: contract.id,
              milestoneId: mid,
              kind:
                outcome === "release_to_worker"
                  ? "dispute_accept_release"
                  : "dispute_accept_refund",
              walletAddress: creator.publicKey.toBase58(),
              idempotencyKey: randomUUID(),
              expectedProposalVersion: "1",
            }),
            /other participant/,
          );
          await execute(
            contract.id,
            mid,
            outcome === "release_to_worker"
              ? "dispute_accept_release"
              : "dispute_accept_refund",
            worker,
            { expectedProposalVersion: "1" },
          );
        } else
          await execute(
            contract.id,
            mid,
            outcome === "release_to_worker"
              ? "dispute_arbitrate_release"
              : "dispute_arbitrate_refund",
            arbitrator,
          );
        const settled = await db.contract.findUniqueOrThrow({
          where: { id: contract.id },
          include: { disputes: true, events: true },
        });
        assert.equal(
          settled.status,
          outcome === "release_to_worker" ? "completed" : "cancelled",
        );
        assert.equal(settled.disputes[0].status, "resolved");
        const count = settled.events.length;
        await syncContractChain(contract.id);
        assert.equal(
          await db.event.count({ where: { contractId: contract.id } }),
          count,
        );
      }
    // Normal release remains supported and all business mutations share pending exclusion.
    const normal = await fixture("bilateral", "Normal payment"),
      mid = normal.milestones[0].id;
    await execute(normal.id, undefined, "fund", creator);
    const donationContext = await (await import("../../lib/services/transactions/chain-sync")).baseChainContext(normal.id);
    const donationTarget = contextAccounts(donationContext).escrowPda;
    await sendDirect(new Transaction().add(SystemProgram.transfer({ fromPubkey: worker.publicKey, toPubkey: donationTarget, lamports: 1 })), worker);
    const v0 = new VersionedTransaction(new TransactionMessage({ payerKey: worker.publicKey, recentBlockhash: (await connection.getLatestBlockhash("confirmed")).blockhash, instructions: [SystemProgram.transfer({ fromPubkey: worker.publicKey, toPubkey: donationTarget, lamports: 1 })] }).compileToV0Message());
    v0.sign([worker]);
    await waitFinal(await connection.sendRawTransaction(v0.serialize(), { preflightCommitment: "confirmed" }));
    await db.contract.update({ where: { id: normal.id }, data: { chainSyncStatus: "review", chainReviewCode: "UNEXPLAINED_WRITABLE_ESCROW", chainReviewAt: new Date() } });
    await syncContractChain(normal.id, creator.publicKey.toBase58());
    assert.equal((await db.contract.findUniqueOrThrow({ where: { id: normal.id } })).chainSyncStatus, "synced");
    console.log("PASS legacy/v0 donation and historical noise review recovery preserve principal");
    await submitMilestoneProof({
      contractId: normal.id,
      milestoneId: mid,
      walletAddress: worker.publicKey.toBase58(),
      note: "Delivered",
    });
    await approveMilestone({
      contractId: normal.id,
      milestoneId: mid,
      walletAddress: creator.publicKey.toBase58(),
    });
    const prepared = await prepareChainOperation({
      contractId: normal.id,
      milestoneId: mid,
      kind: "dispute_open",
      walletAddress: worker.publicKey.toBase58(),
      reason: "Concurrent open",
      idempotencyKey: randomUUID(),
    });
    await assert.rejects(
      approveMilestone({
        contractId: normal.id,
        milestoneId: mid,
        walletAddress: creator.publicKey.toBase58(),
      }),
      /pending/,
    );
    // prepared does not get the building timeout escape hatch.
    await db.escrowTransaction.update({
      where: { id: prepared.transactionId! },
      data: { buildExpiresAt: new Date(0) },
    });
    await recoverChainOperation(prepared.transactionId!);
    assert.equal(
      (
        await db.escrowTransaction.findUniqueOrThrow({
          where: { id: prepared.transactionId! },
        })
      ).status,
      "prepared",
    );
    const tx = Transaction.from(Buffer.from(prepared.transaction!, "base64"));
    tx.sign(worker);
    const saved = await recordSignedOperation({
      transactionId: prepared.transactionId!,
      walletAddress: worker.publicKey.toBase58(),
      signedTransaction: tx.serialize().toString("base64"),
    });
    await connection.sendRawTransaction(tx.serialize());
    await waitFinal(saved.txSig!);
    await recoverChainOperation(prepared.transactionId!);
    await execute(normal.id, mid, "dispute_arbitrate_release", arbitrator).then(
      () => assert.fail("bilateral arbitration must fail"),
      () => {},
    );
    await execute(normal.id, mid, "dispute_propose", creator, {
      outcome: "release_to_worker",
      expectedProposalVersion: "0",
    });
    await execute(normal.id, mid, "dispute_accept_release", worker, {
      expectedProposalVersion: "1",
    });
    const ordinary = await fixture("bilateral", "Ordinary release"),
      ordinaryMid = ordinary.milestones[0].id;
    await execute(ordinary.id, undefined, "fund", creator);
    await submitMilestoneProof({
      contractId: ordinary.id,
      milestoneId: ordinaryMid,
      walletAddress: worker.publicKey.toBase58(),
      note: "Delivered",
    });
    await approveMilestone({
      contractId: ordinary.id,
      milestoneId: ordinaryMid,
      walletAddress: creator.publicKey.toBase58(),
    });
    await execute(ordinary.id, ordinaryMid, "release", creator);
    // A standalone initialization is a real baseline; funding must not initialize again.
    const initialized = await fixture(
      "bilateral",
      "Initialized baseline and direct proposals",
    );
    const initBase = await (
      await import("../../lib/services/transactions/chain-sync")
    ).baseChainContext(initialized.id);
    await sendDirect(
      new Transaction().add(protocolInstruction(initBase, true)),
      creator,
    );
    await syncContractChain(initialized.id);
    assert.equal(
      (await db.contract.findUniqueOrThrow({ where: { id: initialized.id } }))
        .chainBaselineKind,
      "initialized",
    );
    await execute(initialized.id, undefined, "fund", creator);
    const initializedMid = initialized.milestones[0].id;
    const initAccounts = contextAccounts(initBase);
    await transfer(
      connection,
      creator,
      creatorToken,
      initAccounts.vaultPda,
      creator,
      500000,
      [],
      { commitment: "finalized" },
    );
    const directOpen = {
      ...initBase,
      milestoneId: initializedMid,
      kind: "dispute_open" as const,
      actor: worker.publicKey.toBase58(),
      reasonHash: digest("Direct reason"),
      amount: "0",
    };
    await sendDirect(
      new Transaction().add(protocolInstruction(directOpen)),
      worker,
    );
    await syncContractChain(initialized.id);
    assert.equal(
      (
        await db.dispute.findUniqueOrThrow({
          where: { milestoneId: initializedMid },
        })
      ).reason,
      null,
    );
    const proposal = {
      ...directOpen,
      actor: creator.publicKey.toBase58(),
      kind: "dispute_propose" as const,
      outcome: "release_to_worker" as const,
      amount: "10000000",
      version: "0",
    };
    await sendDirect(
      new Transaction().add(protocolInstruction(proposal)),
      creator,
    );
    await sendDirect(
      new Transaction().add(
        protocolInstruction({
          ...proposal,
          actor: worker.publicKey.toBase58(),
          outcome: "refund_to_creator",
          amount: "0",
          version: "1",
        }),
      ),
      worker,
    );
    await syncContractChain(initialized.id);
    assert.equal(
      (
        await db.dispute.findUniqueOrThrow({
          where: { milestoneId: initializedMid },
        })
      ).proposalVersion,
      BigInt(2),
    );
    await assert.rejects(
      prepareChainOperation({
        contractId: initialized.id,
        milestoneId: initializedMid,
        kind: "dispute_accept_refund",
        walletAddress: creator.publicKey.toBase58(),
        expectedProposalVersion: "1",
        idempotencyKey: randomUUID(),
      }),
      /version changed/,
    );
    await execute(
      initialized.id,
      initializedMid,
      "dispute_accept_refund",
      creator,
      { expectedProposalVersion: "2" },
    );
    assert.equal(
      (await getAccount(connection, initAccounts.vaultPda, "finalized")).amount,
      BigInt(500000),
    );
    assert.equal(
      (
        await db.contract.findUniqueOrThrow({ where: { id: initialized.id } })
      ).refundedAmount.toString(),
      "10",
    );
    console.log(
      "PASS initialized funding, direct proposal replacement, stale version, extra tokens excluded from refund",
    );
    // New escrow plans reject unknown milestones before state can be frozen.
    const direct = await fixture("bilateral", "External chain operation");
    await execute(direct.id, undefined, "fund", creator);
    const base = (await import("../../lib/services/transactions/chain-sync"))
      .baseChainContext;
    const c = await base(direct.id);
    const unknown: ChainContext = {
      ...c,
      kind: "dispute_open",
      milestoneId: "unknown-milestone",
      reasonHash: digest("external reason"),
      actor: creator.publicKey.toBase58(),
    };
    await assert.rejects(sendDirect(
      new Transaction().add(protocolInstruction(unknown)),
      creator,
    ));
    await syncContractChain(direct.id);
    assert.equal(
      (await db.contract.findUniqueOrThrow({ where: { id: direct.id } }))
        .chainSyncStatus,
      "synced",
    );
    await assert.rejects(
      prepareChainOperation({
        contractId: direct.id,
        milestoneId: direct.milestones[0].id,
        kind: "release",
        walletAddress: creator.publicKey.toBase58(),
        idempotencyKey: randomUUID(),
      }),
      /approved milestones/,
    );
    const interrupted = await fixture("bilateral", "Interrupted build");
    const operation = await db.escrowTransaction.create({
      data: {
        contractId: interrupted.id,
        kind: "fund",
        action: "fund",
        mode: "onchain",
        walletAddress: creator.publicKey.toBase58(),
        idempotencyKey: randomUUID(),
        status: "building",
        contextVersion: 1,
        contractLockKey: interrupted.id,
        buildToken: randomUUID(),
        buildExpiresAt: new Date(0),
      },
    });
    await recoverChainOperation(operation.id);
    assert.equal(
      (
        await db.escrowTransaction.findUniqueOrThrow({
          where: { id: operation.id },
        })
      ).contractLockKey,
      null,
    );
    assert.equal(
      (
        await db.escrowTransaction.updateMany({
          where: {
            id: operation.id,
            status: "building",
            buildToken: operation.buildToken,
          },
          data: { status: "prepared", preparedTransaction: "late-message" },
        })
      ).count,
      0,
    );
    const expired = await prepareChainOperation({
      contractId: interrupted.id,
      kind: "fund",
      walletAddress: creator.publicKey.toBase58(),
      idempotencyKey: randomUUID(),
    });
    const old = await db.escrowTransaction.findUniqueOrThrow({
      where: { id: expired.transactionId! },
    });
    while (
      BigInt(await connection.getBlockHeight("finalized")) <=
      old.lastValidBlockHeight!
    )
      await new Promise((resolve) => setTimeout(resolve, 500));
    await recoverChainOperation(old.id);
    const expiredRow = await db.escrowTransaction.findUniqueOrThrow({
      where: { id: old.id },
    });
    assert.equal(expiredRow.status, "failed");
    assert.equal(expiredRow.contractLockKey, null);
    const retried = await prepareChainOperation({
      contractId: interrupted.id,
      kind: "fund",
      walletAddress: creator.publicKey.toBase58(),
      idempotencyKey: randomUUID(),
    });
    const retryRow = await db.escrowTransaction.findUniqueOrThrow({
      where: { id: retried.transactionId! },
    });
    assert.equal(retryRow.attempt, old.attempt + 1);
    assert.equal(retryRow.logicalOperationKey, old.logicalOperationKey);
    assert.notEqual(retryRow.preparedTransaction, old.preparedTransaction);
    console.log(
      "PASS finalized expiry releases lock and retry creates a new immutable attempt",
    );
  }
  if (process.env.VESTI_SKIP_BROWSER_TEST !== "1")
    await (
      await import("./browser-chain-acceptance")
    ).runBrowserAcceptance(connection, creator, worker, arbitrator);
  console.log(
    "PASS history replay, isolation, shared locking, interrupted build, signed recovery",
  );
  await mkdir("output/iteration-2", { recursive: true });
  await writeFile(
    "output/iteration-2/chain-evidence.json",
    JSON.stringify(
      {
        network: process.env.ESCROW_NETWORK_GENESIS_HASH,
        programId: programId.toBase58(),
        mint: mint.toBase58(),
        programHash: process.env.ESCROW_PROGRAM_SHA256,
        evidence,
      },
      null,
      2,
    ),
  );
  console.log(
    JSON.stringify(
      {
        network: process.env.ESCROW_NETWORK_GENESIS_HASH,
        programId: programId.toBase58(),
        mint: mint.toBase58(),
        programHash: process.env.ESCROW_PROGRAM_SHA256,
        creatorBalanceBefore: balanceBefore.toString(),
        evidence,
      },
      null,
      2,
    ),
  );
}
void main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
