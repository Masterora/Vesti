import { z } from "zod";
import { inventoryChainRelease } from "@/lib/blockchain/release-inventory";
import { releaseDigest } from "@/lib/blockchain/release-manifest";
import { assertState } from "@/lib/services/errors";
const hash = z.string().regex(/^[a-f0-9]{64}$/);
export const releaseApprovalSchema = z.object({
  schemaVersion: z.literal(1), inventoryStateSha256: hash, manifestSha256: hash,
  completeQueryAttestation: z.string().min(1), allProcessesGateAwareEvidence: z.string().min(1),
  verifiedBuildEvidence: z.string().min(1), activationEvidenceSha256: hash,
  exits: z.array(z.object({ address: z.string(), evidenceSha256: hash }).strict()),
}).strict();
export function inventoryStateDigest(inventory: Awaited<ReturnType<typeof inventoryChainRelease>>) {
  return releaseDigest({ manifestSha256: inventory.manifestSha256, genesisHash: inventory.genesisHash, programId: inventory.programId, accounts: inventory.accounts, contracts: inventory.contracts });
}
export async function verifyMaintenanceApproval(raw: unknown, approvedSha256: string) {
  const approval = releaseApprovalSchema.parse(raw);
  assertState(releaseDigest(approval) === approvedSha256, "Maintenance approval digest differs");
  const inventory = await inventoryChainRelease();
  assertState(approval.manifestSha256 === inventory.manifestSha256 && approval.inventoryStateSha256 === inventoryStateDigest(inventory), "Inventory changed; approve a fresh snapshot");
  assertState(inventory.compatible, "Unknown or incompatible account blocks upgrade");
  const exits = new Set(approval.exits.map((item) => item.address));
  assertState(inventory.accounts.every((account) => exits.has(account.address)), "Every program account requires association and exit evidence");
  return { approval, inventory, approvalSha256: approvedSha256 };
}
