import type { Prisma } from "@prisma/client";
import { assertFound, assertState } from "@/lib/services/errors";

export async function lockContract(
  tx: Prisma.TransactionClient,
  contractId: string,
  userMutation = false,
) {
  await tx.$queryRaw`SELECT id FROM "Contract" WHERE id = ${contractId} FOR UPDATE`;
  const contract = assertFound(
    await tx.contract.findUnique({ where: { id: contractId } }),
    "Contract not found",
  );
  if (userMutation && process.env.ESCROW_ADAPTER_MODE === "onchain") {
    assertState(
      !["review", "degraded"].includes(contract.chainSyncStatus),
      "Contract chain state requires synchronization or review",
    );
    const pending = await tx.escrowTransaction.findFirst({
      where: {
        contractId,
        mode: "onchain",
        OR: [
          {
            status: {
              in: ["building", "prepared", "signed", "submitted", "confirmed"],
            },
          },
          { requiresReviewAt: { not: null } },
        ],
      },
    });
    assertState(
      !pending,
      "Another escrow operation is pending on this contract",
    );
  }
  return contract;
}

export async function advanceBusinessRevision(
  tx: Prisma.TransactionClient,
  contractId: string,
) {
  await tx.contract.update({
    where: { id: contractId },
    data: { businessRevision: { increment: 1 } },
  });
}
