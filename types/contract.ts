import type { SerializedPublicUserProfile } from "@/types/profile";

export type SerializedProofSubmission = {
  id: string;
  milestoneId: string;
  submittedBy: string;
  note: string;
  proofUrl: string | null;
  proofHash: string | null;
  version: number;
  createdAt: string;
};

export type SerializedMilestone = {
  id: string;
  contractId: string;
  index: number;
  title: string;
  description: string | null;
  amount: string;
  dueAt: string | null;
  status: string;
  submittedAt: string | null;
  approvedAt: string | null;
  releasedAt: string | null;
  proofSubmissions?: SerializedProofSubmission[];
};

export type SerializedEvent = {
  id: string;
  contractId: string;
  milestoneId: string | null;
  actorWallet: string;
  eventType: string;
  payload: unknown;
  txSig: string | null;
  createdAt: string;
};

export type SerializedContractComment = {
  id: string;
  contractId: string;
  authorWallet: string;
  body: string;
  createdAt: string;
  updatedAt: string;
};

export type SerializedContractApplication = {
  id: string;
  contractId: string;
  applicantWallet: string;
  createdAt: string;
};

export type SerializedContract = {
  id: string;
  creatorWallet: string;
  workerWallet: string | null;
  requestedWorkerWallet: string | null;
  title: string;
  description: string | null;
  tags: string[];
  isPublic: boolean;
  totalAmount: string;
  fundedAmount: string;
  releasedAmount: string;
  status: string;
  escrowAccount: string | null;
  createdAt: string;
  updatedAt: string;
  milestones: SerializedMilestone[];
  events?: SerializedEvent[];
  comments?: SerializedContractComment[];
  applications?: SerializedContractApplication[];
  profiles?: SerializedPublicUserProfile[];
};
