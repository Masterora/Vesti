import { db } from "@/lib/db";
import { getContractRole } from "@/lib/auth/wallet-role";
import { assertAllowed, assertFound } from "@/lib/services/errors";
import { serializeContractWithProfiles } from "@/lib/services/serialize";
import { getPendingApplicantWallets } from "@/lib/domain/contract-applications";
import type { GetContractInput } from "@/lib/validations/contract";

export async function getContractById(input: GetContractInput) {
  const contract = assertFound(
    await db.contract.findUnique({
      where: { id: input.contractId },
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
        comments: {
          orderBy: { createdAt: "asc" }
        },
        applications: {
          orderBy: { createdAt: "asc" }
        }
      }
    }),
    "Contract not found"
  );

  const role = getContractRole({
    walletAddress: input.walletAddress,
    creatorWallet: contract.creatorWallet,
    workerWallet: contract.workerWallet,
    applicantWallets: getPendingApplicantWallets(contract),
    requestedWorkerWallet: contract.requestedWorkerWallet
  });

  assertAllowed(
    contract.isPublic || role !== "viewer",
    "Only the Creator or Worker can view this contract"
  );

  return serializeContractWithProfiles(contract);
}
