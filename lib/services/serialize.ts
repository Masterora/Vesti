import type {
  Contract,
  ContractApplication,
  ContractComment,
  Dispute,
  EscrowTransaction,
  Event,
  Milestone,
  ProofSubmission
} from "@prisma/client";
import { getPendingApplicantWallets } from "@/lib/domain/contract-applications";
import { getPublicUserProfilesByWallets } from "@/lib/services/profile/user-profiles";
import type { SerializedPublicUserProfile } from "@/types/profile";

type MilestoneWithProofs = Milestone & {
  proofSubmissions?: ProofSubmission[];
};

export type ContractWithRelations = Contract & {
  milestones: MilestoneWithProofs[];
  events?: Event[];
  comments?: ContractComment[];
  applications?: ContractApplication[];
  disputes?: Dispute[];
  escrowTransactions?: EscrowTransaction[];
};

export type ContractListRecord = Pick<
  Contract,
  | "id"
  | "displayId"
  | "creatorWallet"
  | "workerWallet"
  | "requestedWorkerWallet"
  | "title"
  | "description"
  | "tags"
  | "isPublic"
  | "totalAmount"
  | "fundedAmount"
  | "releasedAmount"
  | "refundedAmount"
  | "status"
  | "escrowAccount"
  | "createdAt"
  | "updatedAt"
> & {
  applications?: Array<Pick<ContractApplication, "applicantWallet">>;
  milestones?: Array<Pick<Milestone, "id" | "index" | "title" | "amount" | "dueAt" | "status">>;
  disputes?: Array<Pick<Dispute, "status" | "proposedBy">>;
  _count: {
    milestones: number;
  };
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

function collectContractListWallets(contract: ContractListRecord) {
  return [
    contract.creatorWallet,
    contract.workerWallet,
    contract.requestedWorkerWallet,
    ...(contract.applications?.map((application) => application.applicantWallet) ?? [])
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

export function serializeDispute(dispute: Dispute) {
  return {
    ...dispute,
    resolvedAt: dispute.resolvedAt?.toISOString() ?? null,
    createdAt: dispute.createdAt.toISOString(),
    updatedAt: dispute.updatedAt.toISOString()
  };
}

export function serializeEscrowTransaction(transaction: EscrowTransaction) {
  return {
    id: transaction.id,
    contractId: transaction.contractId,
    milestoneId: transaction.milestoneId,
    action: transaction.action,
    mode: transaction.mode,
    walletAddress: transaction.walletAddress,
    amount: transaction.amount?.toString() ?? null,
    txSig: transaction.txSig,
    status: transaction.status,
    errorCode: transaction.errorCode,
    errorMessage: transaction.errorMessage,
    reconciliationAttempts: transaction.reconciliationAttempts,
    lastAttemptAt: transaction.lastAttemptAt?.toISOString() ?? null,
    nextAttemptAt: transaction.nextAttemptAt?.toISOString() ?? null,
    requiresReviewAt: transaction.requiresReviewAt?.toISOString() ?? null,
    submittedAt: transaction.submittedAt?.toISOString() ?? null,
    confirmedAt: transaction.confirmedAt?.toISOString() ?? null,
    reconciledAt: transaction.reconciledAt?.toISOString() ?? null,
    createdAt: transaction.createdAt.toISOString(),
    updatedAt: transaction.updatedAt.toISOString()
  };
}

export function serializeContract(
  contract: ContractWithRelations,
  profilesByWallet?: Map<string, SerializedPublicUserProfile>
) {
  return {
    ...contract,
    displayId: contract.displayId,
    isPublic: contract.isPublic,
    tags: contract.tags,
    workerWallet: contract.workerWallet,
    requestedWorkerWallet: contract.requestedWorkerWallet,
    totalAmount: contract.totalAmount.toString(),
    fundedAmount: contract.fundedAmount.toString(),
    releasedAmount: contract.releasedAmount.toString(),
    refundedAmount: contract.refundedAmount.toString(),
    createdAt: contract.createdAt.toISOString(),
    updatedAt: contract.updatedAt.toISOString(),
    milestones: contract.milestones.map(serializeMilestone),
    events: contract.events?.map(serializeEvent),
    comments: contract.comments?.map(serializeContractComment),
    applications: contract.applications?.map(serializeContractApplication),
    disputes: contract.disputes?.map(serializeDispute),
    escrowTransactions: contract.escrowTransactions?.map(serializeEscrowTransaction),
    profiles: profilesByWallet
      ? Array.from(new Set(collectContractWallets(contract))).flatMap((wallet) => {
          const profile = profilesByWallet.get(wallet);
          return profile ? [profile] : [];
        })
      : undefined
  };
}

export function serializeContractListItem(
  contract: ContractListRecord,
  profilesByWallet?: Map<string, SerializedPublicUserProfile>
) {
  const orderedMilestones = [...(contract.milestones ?? [])].sort((left, right) => left.index - right.index);
  const currentMilestone =
    (contract.status === "disputed"
      ? orderedMilestones.find((milestone) => milestone.status === "disputed")
      : orderedMilestones.find((milestone) => milestone.status !== "released")) ?? null;

  return {
    id: contract.id,
    displayId: contract.displayId,
    creatorWallet: contract.creatorWallet,
    workerWallet: contract.workerWallet,
    requestedWorkerWallet: contract.requestedWorkerWallet,
    title: contract.title,
    description: contract.description,
    tags: contract.tags,
    isPublic: contract.isPublic,
    totalAmount: contract.totalAmount.toString(),
    fundedAmount: contract.fundedAmount.toString(),
    releasedAmount: contract.releasedAmount.toString(),
    refundedAmount: contract.refundedAmount.toString(),
    status: contract.status,
    escrowAccount: contract.escrowAccount,
    createdAt: contract.createdAt.toISOString(),
    updatedAt: contract.updatedAt.toISOString(),
    milestoneCount: contract._count.milestones,
    currentMilestone: currentMilestone
      ? {
          id: currentMilestone.id,
          index: currentMilestone.index,
          title: currentMilestone.title,
          amount: currentMilestone.amount.toString(),
          dueAt: currentMilestone.dueAt?.toISOString() ?? null,
          status: currentMilestone.status
        }
      : null,
    activeDispute: contract.disputes?.[0] ?? null,
    pendingApplicantWallets: getPendingApplicantWallets(contract),
    profiles: profilesByWallet
      ? Array.from(new Set(collectContractListWallets(contract))).flatMap((wallet) => {
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
