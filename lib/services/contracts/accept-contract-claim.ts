import { db } from "@/lib/db";
import { getPendingApplicantWallets } from "@/lib/domain/contract-applications";
import { recordEvent } from "@/lib/services/events/record-event";
import { assertAllowed, assertFound, assertState } from "@/lib/services/errors";
import { serializeContract } from "@/lib/services/serialize";
import type { AcceptContractClaimInput } from "@/lib/validations/contract";

export async function acceptContractClaim(input: AcceptContractClaimInput) {
  return db.$transaction(async (tx) => {
    const contract = assertFound(
      await tx.contract.findUnique({
        where: { id: input.contractId },
        include: {
          applications: {
            orderBy: { createdAt: "asc" }
          }
        }
      }),
      "Contract not found"
    );

    assertAllowed(
      input.walletAddress === contract.creatorWallet,
      "Only the Creator can accept a worker claim"
    );
    assertState(contract.status === "claimed", "Only claimed contracts can accept an applicant");
    assertState(
      getPendingApplicantWallets(contract).includes(input.applicantWallet),
      "Selected applicant was not found on this contract"
    );

    await tx.contractApplication.deleteMany({
      where: { contractId: contract.id }
    });

    await tx.contract.update({
      where: { id: contract.id },
      data: {
        workerWallet: input.applicantWallet,
        requestedWorkerWallet: null,
        status: "draft"
      }
    });

    await recordEvent(tx, {
      contractId: contract.id,
      actorWallet: input.walletAddress,
      eventType: "contract_claim_accepted",
      payload: {
        workerWallet: input.applicantWallet
      }
    });

    const updated = await tx.contract.findUniqueOrThrow({
      where: { id: contract.id },
      include: {
        milestones: {
          orderBy: { index: "asc" },
          include: {
            proofSubmissions: {
              orderBy: { version: "desc" }
            }
          }
        },
        events: {
          orderBy: { createdAt: "desc" }
        },
        applications: {
          orderBy: { createdAt: "asc" }
        }
      }
    });

    return serializeContract(updated);
  });
}
