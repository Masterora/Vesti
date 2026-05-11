import type {
  Contract,
  ContractApplication,
  ContractComment,
  Event,
  Milestone,
  ProofSubmission
} from "@prisma/client";
import { getPublicUserProfilesByWallets } from "@/lib/services/user-profiles";
import { formatContractDisplayId } from "@/lib/utils";
import type { SerializedPublicUserProfile } from "@/types/profile";

type MilestoneWithProofs = Milestone & {
  proofSubmissions?: ProofSubmission[];
};

export type ContractWithRelations = Contract & {
  milestones: MilestoneWithProofs[];
  events?: Event[];
  comments?: ContractComment[];
  applications?: ContractApplication[];
};

function collectContractWallets(contract: ContractWithRelations) {
  return [
    contract.creatorWallet,
    contract.workerWallet,
    contract.requestedWorkerWallet,
    ...(contract.comments?.map((comment) => comment.authorWallet) ?? []),
    ...(contract.applications?.map((application) => application.applicantWallet) ?? []),
    ...(contract.events?.map((event) => event.actorWallet) ?? []),
    ...contract.milestones.flatMap((milestone) => milestone.proofSubmissions?.map((proof) => proof.submittedBy) ?? [])
  ].filter((wallet): wallet is string => Boolean(wallet?.trim()));
}

export function serializeProofSubmission(proof: ProofSubmission) {
  return {
    ...proof,
    createdAt: proof.createdAt.toISOString()
  };
}

export function serializeMilestone(milestone: MilestoneWithProofs) {
  return {
    ...milestone,
    amount: milestone.amount.toString(),
    dueAt: milestone.dueAt?.toISOString() ?? null,
    submittedAt: milestone.submittedAt?.toISOString() ?? null,
    approvedAt: milestone.approvedAt?.toISOString() ?? null,
    releasedAt: milestone.releasedAt?.toISOString() ?? null,
    createdAt: milestone.createdAt.toISOString(),
    updatedAt: milestone.updatedAt.toISOString(),
    proofSubmissions: milestone.proofSubmissions?.map(serializeProofSubmission)
  };
}

export function serializeEvent(event: Event) {
  return {
    ...event,
    createdAt: event.createdAt.toISOString()
  };
}

export function serializeContractComment(comment: ContractComment) {
  return {
    ...comment,
    createdAt: comment.createdAt.toISOString(),
    updatedAt: comment.updatedAt.toISOString()
  };
}

export function serializeContractApplication(application: ContractApplication) {
  return {
    ...application,
    createdAt: application.createdAt.toISOString()
  };
}

export function serializeContract(
  contract: ContractWithRelations,
  profilesByWallet?: Map<string, SerializedPublicUserProfile>
) {
  return {
    ...contract,
    displayId: formatContractDisplayId(contract.id),
    isPublic: contract.isPublic,
    tags: contract.tags,
    workerWallet: contract.workerWallet,
    requestedWorkerWallet: contract.requestedWorkerWallet,
    totalAmount: contract.totalAmount.toString(),
    fundedAmount: contract.fundedAmount.toString(),
    releasedAmount: contract.releasedAmount.toString(),
    createdAt: contract.createdAt.toISOString(),
    updatedAt: contract.updatedAt.toISOString(),
    milestones: contract.milestones.map(serializeMilestone),
    events: contract.events?.map(serializeEvent),
    comments: contract.comments?.map(serializeContractComment),
    applications: contract.applications?.map(serializeContractApplication),
    profiles: profilesByWallet
      ? Array.from(new Set(collectContractWallets(contract))).flatMap((wallet) => {
          const profile = profilesByWallet.get(wallet);
          return profile ? [profile] : [];
        })
      : undefined
  };
}

export async function serializeContractWithProfiles(contract: ContractWithRelations) {
  const profilesByWallet = await getPublicUserProfilesByWallets(collectContractWallets(contract));

  return serializeContract(contract, profilesByWallet);
}
