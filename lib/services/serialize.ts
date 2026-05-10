import type { Contract, Event, Milestone, ProofSubmission } from "@prisma/client";

type MilestoneWithProofs = Milestone & {
  proofSubmissions?: ProofSubmission[];
};

export type ContractWithRelations = Contract & {
  milestones: MilestoneWithProofs[];
  events?: Event[];
};

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

export function serializeContract(contract: ContractWithRelations) {
  return {
    ...contract,
    isPublic: contract.isPublic,
    workerWallet: contract.workerWallet,
    requestedWorkerWallet: contract.requestedWorkerWallet,
    totalAmount: contract.totalAmount.toString(),
    fundedAmount: contract.fundedAmount.toString(),
    releasedAmount: contract.releasedAmount.toString(),
    createdAt: contract.createdAt.toISOString(),
    updatedAt: contract.updatedAt.toISOString(),
    milestones: contract.milestones.map(serializeMilestone),
    events: contract.events?.map(serializeEvent)
  };
}
