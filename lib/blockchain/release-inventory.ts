import { PublicKey } from "@solana/web3.js";
import { chainConfig, digest } from "./chain-protocol";
import { decodeEscrowStateAccount } from "./solana-escrow-reconciliation";
import { deriveEscrowPda, deriveLegacyEscrowPda, deriveSolanaEscrowAccounts, TOKEN_PROGRAM_ID } from "./solana-escrow-accounts";
import { configuredRelease, releaseDigest } from "./release-manifest";
import { db } from "@/lib/db";

export async function inventoryChainRelease() {
  const release = configuredRelease(), { connection, programId } = chainConfig();
  const genesisHash = await connection.getGenesisHash();
  if (genesisHash !== release.manifest.genesisHash) throw new Error("CHAIN_NETWORK_MISMATCH");
  // No Mint, dataSize, discriminator or DB filters: upgrade affects every program-owned account.
  const response = await connection.getProgramAccounts(programId, { commitment: "finalized", withContext: true });
  const contracts = await db.contract.findMany({ select: { id: true, escrowAccount: true, businessRevision: true, chainBaselineEvidence: true } });
  const layouts: Record<string, { name: string; size?: number; minimum?: number }> = Object.fromEntries(([
    ["EscrowState", { name: "escrow", size: 199 }], ["DisputeState", { name: "dispute", size: 227 }],
    ["DisputePolicy", { name: "policy", size: 74 }], ["MilestoneReleaseReceipt", { name: "receipt", size: 80 }],
    ["MilestonePlan", { name: "plan", size: 364 }],
  ] as [string, { name: string; size?: number; minimum?: number }][]).map(([name, layout]) => [digest(`account:${name}`).slice(0, 16), layout]));
  const accounts = [];
  for (const row of [...response.value].sort((a, b) => a.pubkey.toBase58().localeCompare(b.pubkey.toBase58()))) {
    const data = row.account.data, layout = layouts[data.subarray(0, 8).toString("hex")];
    const item = { address: row.pubkey.toBase58(), dataSha256: digest(data), byteLength: data.length, layout: layout?.name ?? "unknown", compatible: false, reason: "UNKNOWN_LAYOUT", details: {} as Record<string, unknown> };
    if (layout && ((layout.size && data.length === layout.size) || (layout.minimum && data.length >= layout.minimum))) {
      if (layout.name === "escrow") {
        try {
          const state = decodeEscrowStateAccount(data);
          const legacy = deriveLegacyEscrowPda(state.contractId, programId).address.equals(row.pubkey);
          const v2 = deriveEscrowPda(state.contractId, programId, new PublicKey(state.creator)).address.equals(row.pubkey);
          const [mint, vault] = await connection.getMultipleAccountsInfo([new PublicKey(state.usdcMint), new PublicKey(state.vault)], "finalized");
          const classic = !!mint?.owner.equals(TOKEN_PROGRAM_ID) && !!vault?.owner.equals(TOKEN_PROGRAM_ID);
          const bindings = deriveSolanaEscrowAccounts({ contractId: state.contractId, creator: new PublicKey(state.creator), worker: new PublicKey(state.worker), usdcMint: new PublicKey(state.usdcMint), programId, addressScheme: legacy ? "legacy" : "creator" });
          const principal = state.status === 4 ? 0n : state.fundedAmount - state.releasedAmount;
          const valid = classic && state.contractId.length > 0 && Buffer.byteLength(state.contractId) <= 32 && state.creator !== state.worker && bindings.vaultPda.toBase58() === state.vault && bindings.escrowBump === state.bump && bindings.vaultBump === state.vaultBump && state.fundedAmount <= state.totalAmount &&
            (state.status === 0 ? state.fundedAmount === 0n && state.releasedAmount === 0n : state.fundedAmount === state.totalAmount) && vault!.data.readBigUInt64LE(64) >= principal && vault!.data[108] === 1 && classic && mint!.data.length === 82 && mint!.data[44] === 6 && mint!.data[45] === 1 && vault!.data.length === 165 &&
            new PublicKey(vault!.data.subarray(0, 32)).toBase58() === state.usdcMint && new PublicKey(vault!.data.subarray(32, 64)).equals(row.pubkey) && state.status <= 4 && state.releasedAmount <= state.fundedAmount;
          item.compatible = valid && (legacy || v2);
          item.reason = item.compatible ? "KNOWN_CLASSIC_LAYOUT_REQUIRES_EXIT_PROOF" : "UNVERIFIED_TOKEN_OR_BINDING";
          item.details = { contractId: state.contractId, mint: state.usdcMint, approvedMint: state.usdcMint === release.manifest.mint.address,
            bound: contracts.some((c) => c.escrowAccount === item.address), addressScheme: legacy ? "legacy" : v2 ? "creator" : "unknown",
            tokenProgram: vault?.owner.toBase58() ?? "unknown", total: state.totalAmount.toString(), creator: state.creator, worker: state.worker, vault: state.vault, funded: state.fundedAmount.toString(), released: state.releasedAmount.toString(), status: state.status,
            vaultUnits: vault?.data.length === 165 ? vault.data.readBigUInt64LE(64).toString() : null };
        } catch { item.reason = "INVALID_ESCROW_LAYOUT"; }
      } else { item.compatible = true; item.reason = "KNOWN_LAYOUT_REQUIRES_ASSOCIATION_PROOF"; }
    }
    accounts.push(item);
  }
  const byAddress = new Map(accounts.map((item) => [item.address, item]));
  for (const row of response.value) {
    const item = byAddress.get(row.pubkey.toBase58())!;
    if (!item.compatible || item.layout === "escrow") continue;
    const data = row.account.data, escrow = new PublicKey(data.subarray(8, 40)), parent = byAddress.get(escrow.toBase58());
    let associated = parent?.layout === "escrow" && parent.compatible;
    if (item.layout === "plan") {
      const terms = data.readUInt32LE(40), hashes = new Set<string>(); let total = 0n;
      associated &&= terms > 0 && terms <= 8;
      if (terms <= 8) for (let n = 0; n < terms; n++) { const offset = 44 + n * 40; hashes.add(data.subarray(offset, offset + 32).toString("hex")); const amount = data.readBigUInt64LE(offset + 32); associated &&= amount > 0n; total += amount; }
      associated &&= hashes.size === terms && total.toString() === parent?.details.total && PublicKey.findProgramAddressSync([Buffer.from("plan"), escrow.toBuffer()], programId)[0].equals(row.pubkey);
    } else if (item.layout === "policy") {
      const arbitrator = new PublicKey(data.subarray(40, 72)).toBase58();
      associated &&= data[72] === 1 && ![parent?.details.creator, parent?.details.worker].includes(arbitrator) && PublicKey.findProgramAddressSync([Buffer.from("policy"), escrow.toBuffer()], programId)[0].equals(row.pubkey);
      item.details = { escrow: escrow.toBase58(), arbitrator };
    } else {
      const hash = data.subarray(40, 72), seed = item.layout === "receipt" ? "release" : "dispute";
      associated &&= PublicKey.findProgramAddressSync([Buffer.from(seed), escrow.toBuffer(), hash], programId)[0].equals(row.pubkey);
      if (item.layout === "dispute") associated &&= data[136] <= 2 && data[169] <= 2;
      else associated &&= data.readBigUInt64LE(72) > 0n;
      item.details = { escrow: escrow.toBase58(), milestoneHash: hash.toString("hex") };
    }
    item.compatible = Boolean(associated); if (!associated) item.reason = "INVALID_ASSOCIATION_OR_LAYOUT";
  }
  const result = { schemaVersion: 1, releaseId: release.manifest.releaseId, manifestSha256: release.manifestSha256, genesisHash,
    programId: programId.toBase58(), slot: response.context.slot.toString(), accountSetSha256: releaseDigest(accounts.map((a) => a.address)), accounts,
    contracts: contracts.map((c) => ({ ...c, businessRevision: c.businessRevision.toString() })),
    // RPCs may silently cap getProgramAccounts. Explicit provider attestation is required separately.
    countStatus: "unattested" as const, compatible: accounts.every((a) => a.compatible), capturedAt: new Date().toISOString() };
  return { ...result, evidenceSha256: releaseDigest(result) };
}
