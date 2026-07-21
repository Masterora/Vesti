"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Check,
  CircleDollarSign,
  Ban,
  Copy,
  PencilLine,
  Eye,
  EyeOff,
  RefreshCw,
  Trash2,
  Wallet
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocale } from "@/components/i18n/locale-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Label, Textarea } from "@/components/ui/input";
import { ProfileAvatar } from "@/components/ui/profile-avatar";
import { ContractProgress } from "@/components/contracts/contract-progress";
import { ContractDiscussion } from "@/components/contracts/contract-discussion";
import { DisputeResolutionPanel } from "@/components/contracts/dispute-resolution-panel";
import { EscrowTransactionStatus } from "@/components/contracts/escrow-transaction-status";
import { ContractWalletLine as WalletLine } from "@/components/contracts/contract-wallet-line";
import {
  MilestoneActions,
  ProofHistory,
  type ProofDraft
} from "@/components/contracts/milestone-workflow";
import { EventTimeline } from "@/components/timeline/event-timeline";
import { useWallet } from "@/components/wallet/wallet-provider";
import { postJson } from "@/lib/api/client";
import { getWalletAvatarImage, getWalletDisplayLabel, getWalletDisplayName } from "@/lib/profile/display-profiles";
import { getPendingApplicantWallets } from "@/lib/domain/contract-applications";
import { formatDate, formatUsdc, shortenWallet } from "@/lib/utils";
import type { SerializedContract, SerializedMilestone } from "@/types/contract";

type ContractDetailClientProps = {
  contractId: string;
};

type PreparedEscrowTransaction = {
  mode: string;
  action: "fund_contract" | "release_milestone";
  contractId: string;
  milestoneId?: string;
  transaction: string | null;
  transactionId: string | null;
  idempotencyKey: string;
  canUseDirectAction: boolean;
  message?: string;
};

type ConfirmedEscrowTransaction = {
  mode: string;
  action: "fund_contract" | "release_milestone";
  contractId: string;
  milestoneId?: string;
  confirmed: boolean;
  contract?: SerializedContract;
  canUseDirectAction?: boolean;
  message?: string;
};

type EscrowActionInput = {
  actionKey: string;
  prepareUrl: string;
  prepareBody: Record<string, unknown>;
  directUrl: string;
  directBody: Record<string, unknown>;
  confirmUrl: string;
  confirmBody: Record<string, unknown>;
};

type PendingEscrowSubmission = {
  contractId: string;
  milestoneId?: string;
  walletAddress: string;
  transactionId: string;
  txSig: string;
  confirmUrl: string;
  createdAt: string;
};

const pendingEscrowSubmissionStorageKey = "vesti.pendingEscrowSubmissions";
const legacyPendingEscrowSubmissionStorageKey = "vesti.pendingEscrowSubmission";

function isPendingEscrowSubmission(value: unknown): value is PendingEscrowSubmission {
  if (!value || typeof value !== "object") {
    return false;
  }

  const parsed = value as Partial<PendingEscrowSubmission>;
  const validConfirmUrl = [
    "/api/transactions/confirm-fund",
    "/api/transactions/confirm-release"
  ].includes(parsed.confirmUrl ?? "");

  return Boolean(
    parsed.contractId &&
      parsed.walletAddress &&
      parsed.transactionId &&
      parsed.txSig &&
      validConfirmUrl &&
      parsed.createdAt &&
      !Number.isNaN(new Date(parsed.createdAt).getTime())
  );
}

function readPendingEscrowSubmissions() {
  try {
    const value =
      window.localStorage.getItem(pendingEscrowSubmissionStorageKey) ??
      window.localStorage.getItem(legacyPendingEscrowSubmissionStorageKey);

    if (!value) {
      return [];
    }

    const parsed = JSON.parse(value) as unknown;
    const submissions = (Array.isArray(parsed) ? parsed : [parsed]).filter(
      isPendingEscrowSubmission
    );

    return submissions.slice(-20);
  } catch {
    return [];
  }
}

function storePendingEscrowSubmission(submission: PendingEscrowSubmission) {
  const submissions = readPendingEscrowSubmissions().filter(
    (current) => current.transactionId !== submission.transactionId
  );
  submissions.push(submission);
  window.localStorage.setItem(
    pendingEscrowSubmissionStorageKey,
    JSON.stringify(submissions.slice(-20))
  );
  window.localStorage.removeItem(legacyPendingEscrowSubmissionStorageKey);
}

function clearPendingEscrowSubmission(transactionId: string) {
  const submissions = readPendingEscrowSubmissions().filter(
    (current) => current.transactionId !== transactionId
  );

  if (submissions.length === 0) {
    window.localStorage.removeItem(pendingEscrowSubmissionStorageKey);
  } else {
    window.localStorage.setItem(pendingEscrowSubmissionStorageKey, JSON.stringify(submissions));
  }
  window.localStorage.removeItem(legacyPendingEscrowSubmissionStorageKey);
}

function getLatestRevisionRequestNote(contract: SerializedContract, milestoneId: string) {
  const event = (contract.events ?? []).find(
      (candidate) =>
        candidate.milestoneId === milestoneId &&
        candidate.eventType === "milestone_revision_requested"
  );

  if (!event?.payload || typeof event.payload !== "object") {
    return "";
  }

  const note = (event.payload as Record<string, unknown>).note;
  return typeof note === "string" ? note : "";
}

async function persistSubmittedEscrowTransaction(submission: PendingEscrowSubmission) {
  storePendingEscrowSubmission(submission);
  return postJson<{ transactionId: string; status: string }>("/api/transactions/submit", submission);
}

async function fetchContract(contractId: string, walletAddress: string) {
  return postJson<SerializedContract>("/api/contracts/get", {
    contractId,
    walletAddress: walletAddress.trim() ? walletAddress : undefined
  });
}

export function ContractDetailClient({ contractId }: ContractDetailClientProps) {
  const router = useRouter();
  const { locale, messages } = useLocale();
  const { walletAddress, signAndSendPreparedTransaction } = useWallet();
  const copy = messages.contractDetail;
  const [contract, setContract] = useState<SerializedContract | null>(null);
  const [titleDraft, setTitleDraft] = useState("");
  const [proofDrafts, setProofDrafts] = useState<Record<string, ProofDraft>>({});
  const [revisionDrafts, setRevisionDrafts] = useState<Record<string, string>>({});
  const [disputeDrafts, setDisputeDrafts] = useState<Record<string, string>>({});
  const [cancelReason, setCancelReason] = useState("");
  const [error, setError] = useState("");
  const [successState, setSuccessState] = useState({ walletAddress: "", message: "" });
  const successMessage =
    successState.walletAddress === walletAddress ? successState.message : "";
  const setSuccessMessage = useCallback(
    (message: string) => setSuccessState({ walletAddress, message }),
    [walletAddress]
  );
  const [isLoading, setIsLoading] = useState(Boolean(contractId));
  const [activeAction, setActiveAction] = useState("");

  const role = useMemo(() => {
    if (!contract) {
      return "viewer";
    }

    if (walletAddress === contract.creatorWallet) {
      return "creator";
    }

    if (walletAddress === contract.workerWallet) {
      return "worker";
    }

    if (getPendingApplicantWallets(contract).includes(walletAddress)) {
      return "applicant";
    }

    return "viewer";
  }, [contract, walletAddress]);
  const activeDispute = contract?.disputes?.find((dispute) => dispute.status !== "resolved");
  const pendingEscrowTransaction = contract?.escrowTransactions?.find(
    (transaction) => transaction.status !== "reconciled"
  );
  const contractTags = contract?.tags ?? [];
  const pendingApplicants = useMemo(
    () => (contract ? getPendingApplicantWallets(contract) : []),
    [contract]
  );

  const loadContract = useCallback(async () => {
    if (!contractId) {
      return;
    }

    setIsLoading(true);
    setError("");

    try {
      const data = await fetchContract(contractId, walletAddress);
      setContract(data);
      setTitleDraft(data.title);
      setError("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : messages.errors.failedToLoadContract);
    } finally {
      setIsLoading(false);
    }
  }, [contractId, messages.errors.failedToLoadContract, walletAddress]);

  const replaceContractWithCurrentSnapshot = useCallback(
    async (fallback: SerializedContract) => {
      let current = fallback;

      try {
        current = await fetchContract(contractId, walletAddress);
      } catch {
        // Keep the successful mutation response if refreshing the expanded snapshot fails.
      }

      setContract(current);
      setTitleDraft(current.title);
      return current;
    },
    [contractId, walletAddress]
  );

  const copyDisplayId = async () => {
    if (!contract?.displayId) {
      return;
    }

    try {
      if (!navigator.clipboard) {
        throw new Error(copy.idCopyFailed);
      }

      await navigator.clipboard.writeText(contract.displayId);
      setError("");
      setSuccessMessage(copy.idCopied);
    } catch {
      setSuccessMessage("");
      setError(copy.idCopyFailed);
    }
  };

  useEffect(() => {
    if (!contractId) {
      return;
    }

    let isCurrent = true;

    const loadInitialContract = async () => {
      try {
        const data = await fetchContract(contractId, walletAddress);

        if (isCurrent) {
          setContract(data);
          setTitleDraft(data.title);
          setError("");
        }
      } catch (caught) {
        if (isCurrent) {
          setError(caught instanceof Error ? caught.message : messages.errors.failedToLoadContract);
        }
      } finally {
        if (isCurrent) {
          setIsLoading(false);
        }
      }
    };

    void loadInitialContract();

    return () => {
      isCurrent = false;
    };
  }, [contractId, messages.errors.failedToLoadContract, walletAddress]);

  useEffect(() => {
    if (!contractId || !walletAddress) {
      return;
    }

    const pendingSubmissions = readPendingEscrowSubmissions().filter(
      (pending) => pending.contractId === contractId && pending.walletAddress === walletAddress
    );

    if (pendingSubmissions.length === 0) {
      return;
    }

    let isCurrent = true;

    const recoverSubmission = async () => {
      setActiveAction("retry-confirmation");
      setError("");

      for (const pending of pendingSubmissions) {
        try {
          await persistSubmittedEscrowTransaction(pending);
          const confirmed = await postJson<ConfirmedEscrowTransaction>(pending.confirmUrl, pending);

          if (!confirmed.contract) {
            throw new Error(messages.errors.confirmedTransactionMissingContract);
          }

          clearPendingEscrowSubmission(pending.transactionId);
          if (isCurrent) {
            await replaceContractWithCurrentSnapshot(confirmed.contract);
            setSuccessMessage(copy.transactionReconciled);
          }
        } catch (caught) {
          if (isCurrent) {
            setError(caught instanceof Error ? caught.message : messages.errors.escrowActionFailed);
          }
        }
      }

      if (isCurrent) {
        setActiveAction("");
      }
    };

    void recoverSubmission();

    return () => {
      isCurrent = false;
    };
  }, [contractId, copy.transactionReconciled, messages.errors.confirmedTransactionMissingContract, messages.errors.escrowActionFailed, replaceContractWithCurrentSnapshot, setSuccessMessage, walletAddress]);

  const runAction = async (actionKey: string, url: string, body: unknown) => {
    setActiveAction(actionKey);
    setError("");
    setSuccessMessage("");

    try {
      const data = await postJson<SerializedContract>(url, body);
      await replaceContractWithCurrentSnapshot(data);
      setSuccessMessage(getSuccessMessage(actionKey, copy));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : messages.errors.actionFailed);
    } finally {
      setActiveAction("");
    }
  };

  const retryTransactionConfirmation = async () => {
    if (!pendingEscrowTransaction?.txSig) {
      return;
    }

    const isFunding = pendingEscrowTransaction.action === "fund";
    setActiveAction("retry-confirmation");
    setError("");
    try {
      const confirmed = await postJson<ConfirmedEscrowTransaction>(
        isFunding ? "/api/transactions/confirm-fund" : "/api/transactions/confirm-release",
        {
          contractId: contractId,
          milestoneId: pendingEscrowTransaction.milestoneId ?? undefined,
          walletAddress,
          transactionId: pendingEscrowTransaction.id,
          txSig: pendingEscrowTransaction.txSig
        }
      );
      if (!confirmed.contract) {
        throw new Error(messages.errors.confirmedTransactionMissingContract);
      }
      await replaceContractWithCurrentSnapshot(confirmed.contract);
      clearPendingEscrowSubmission(pendingEscrowTransaction.id);
      setSuccessMessage(copy.transactionReconciled);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : messages.errors.escrowActionFailed);
    } finally {
      setActiveAction("");
    }
  };

  const runEscrowAction = useCallback(
    async ({
      actionKey,
      prepareUrl,
      prepareBody,
      directUrl,
      directBody,
      confirmUrl,
      confirmBody
    }: EscrowActionInput) => {
      setActiveAction(actionKey);
      setError("");
      setSuccessMessage("");

      try {
        const idempotencyKey = crypto.randomUUID();
        const prepared = await postJson<PreparedEscrowTransaction>(prepareUrl, {
          ...prepareBody,
          idempotencyKey
        });

        if (prepared.canUseDirectAction) {
          const data = await postJson<SerializedContract>(directUrl, {
            ...directBody,
            idempotencyKey
          });
          await replaceContractWithCurrentSnapshot(data);
          setSuccessMessage(getSuccessMessage(actionKey, copy));
          return;
        }

        if (!prepared.transaction) {
          throw new Error(messages.errors.preparedTransactionMissing);
        }
        if (!prepared.transactionId) {
          throw new Error(messages.errors.preparedTransactionMissing);
        }

        const txSig = await signAndSendPreparedTransaction(prepared.transaction, async (signature) => {
          await persistSubmittedEscrowTransaction({
            ...confirmBody,
            contractId: prepared.contractId,
            milestoneId: prepared.milestoneId,
            walletAddress,
            transactionId: prepared.transactionId!,
            txSig: signature,
            confirmUrl,
            createdAt: new Date().toISOString()
          });
        });
        const confirmed = await postJson<ConfirmedEscrowTransaction>(confirmUrl, {
          ...confirmBody,
          transactionId: prepared.transactionId,
          txSig
        });

        if (!confirmed.contract) {
          throw new Error(messages.errors.confirmedTransactionMissingContract);
        }

        clearPendingEscrowSubmission(prepared.transactionId);
        await replaceContractWithCurrentSnapshot(confirmed.contract);
        setSuccessMessage(getSuccessMessage(actionKey, copy));
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : messages.errors.escrowActionFailed);
      } finally {
        setActiveAction("");
      }
    },
    [
      copy,
      messages.errors.confirmedTransactionMissingContract,
      messages.errors.escrowActionFailed,
      messages.errors.preparedTransactionMissing,
      replaceContractWithCurrentSnapshot,
      setSuccessMessage,
      signAndSendPreparedTransaction,
      walletAddress
    ]
  );

  const submitProof = async (milestone: SerializedMilestone) => {
    const draft = proofDrafts[milestone.id] ?? {
      note: "",
      proofUrl: ""
    };

    await runAction(`submit-${milestone.id}`, "/api/milestones/submit-proof", {
      contractId,
      milestoneId: milestone.id,
      walletAddress,
      note: draft.note,
      proofUrl: draft.proofUrl || undefined
    });
  };

  const updateDraft = (milestoneId: string, patch: Partial<ProofDraft>) => {
    setProofDrafts((current) => ({
      ...current,
      [milestoneId]: {
        note: current[milestoneId]?.note ?? "",
        proofUrl: current[milestoneId]?.proofUrl ?? "",
        ...patch
      }
    }));
  };

  const updateRevisionDraft = (milestoneId: string, note: string) => {
    setRevisionDrafts((current) => ({
      ...current,
      [milestoneId]: note
    }));
  };

  const updateDisputeDraft = (milestoneId: string, reason: string) => {
    setDisputeDrafts((current) => ({
      ...current,
      [milestoneId]: reason
    }));
  };

  const toggleVisibility = async (isPublic: boolean) => {
    await runAction("visibility", "/api/contracts/visibility", {
      contractId,
      walletAddress,
      isPublic
    });
  };

  const deleteProject = async () => {
    setActiveAction("delete");
    setError("");
    setSuccessMessage("");

    try {
      await postJson<{ deleted: boolean; contractId: string }>("/api/contracts/delete", {
        contractId,
        walletAddress
      });
      router.push("/dashboard?deleted=1");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : messages.errors.actionFailed);
    } finally {
      setActiveAction("");
    }
  };

  if (!contractId) {
    return (
      <div className="page-shell py-10">
        <Card>
          <h1 className="text-xl font-semibold">{copy.missingIdTitle}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{copy.missingIdDescription}</p>
        </Card>
      </div>
    );
  }

  return (
    <div className="page-shell py-10">
      <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-primary">{copy.eyebrow}</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight md:text-4xl">
            {contract?.title ?? (isLoading ? copy.loadingTitle : copy.notFoundTitle)}
          </h1>
          {contract ? (
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <span>
                {copy.idLabel} {contract.displayId}
              </span>
              <Button
                type="button"
                variant="ghost"
                className="h-7 px-2 text-[11px] font-semibold tracking-normal text-muted-foreground"
                onClick={() => void copyDisplayId()}
                title={copy.copyId}
                aria-label={copy.copyId}
              >
                <Copy className="mr-1 size-3.5" aria-hidden="true" />
                {copy.copyId}
              </Button>
            </div>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="secondary" onClick={loadContract} disabled={isLoading}>
            <RefreshCw className="mr-2 size-4" aria-hidden="true" />
            {copy.refresh}
          </Button>
          <Link href="/dashboard">
            <Button type="button" variant="secondary">{copy.dashboard}</Button>
          </Link>
        </div>
      </div>

      {error ? <p className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
      {!error && successMessage ? (
        <p className="mb-4 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
          {successMessage}
        </p>
      ) : null}

      {isLoading ? (
        <Card>{copy.loadingTitle}...</Card>
      ) : !contract ? null : (
        <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
          <div className="space-y-6">
            <Card>
              <div className="flex flex-wrap items-center gap-2">
                <Badge value={contract.status} />
                <Badge
                  value={contract.isPublic ? "public" : "private"}
                  label={contract.isPublic ? copy.public : copy.private}
                />
              </div>
              {contract.status === "open" ? (
                <p className="mt-4 rounded-lg border border-sky-200 bg-sky-50 p-3 text-sm text-sky-800">
                  {copy.openNotice}
                </p>
              ) : null}
              {contract.status === "claimed" ? (
                <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                  {pendingApplicants.length === 1 ? copy.claimedNoticeSingle : copy.claimedNotice}
                </p>
              ) : null}
              {contract.status === "draft" ? (
                <p className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
                  {copy.matchedNotice}
                </p>
              ) : null}
              {role === "creator" &&
              ["open", "claimed", "draft", "active", "disputed"].includes(contract.status) ? (
                <div className="mt-5 rounded-lg border border-border bg-muted/40 p-4">
                  <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
                    <div className="grid gap-2">
                      <Label>{copy.titleLabel}</Label>
                      <Input
                        value={titleDraft}
                        onChange={(event) => setTitleDraft(event.target.value)}
                        placeholder={copy.titleLabel}
                      />
                    </div>
                    <Button
                      type="button"
                      className="w-full sm:w-auto"
                      onClick={() =>
                        runAction("rename", "/api/contracts/rename", {
                          contractId: contract.id,
                          walletAddress,
                          title: titleDraft
                        })
                      }
                      disabled={!titleDraft.trim() || titleDraft.trim() === contract.title || activeAction === "rename"}
                    >
                      <PencilLine className="mr-2 size-4" aria-hidden="true" />
                      {activeAction === "rename" ? copy.renamingTitle : copy.renameTitle}
                    </Button>
                  </div>
                </div>
              ) : null}
              <p className="mt-4 text-sm leading-6 text-muted-foreground">
                {contract.description || copy.noDescription}
              </p>
              {contractTags.length > 0 ? (
                <div className="mt-4 flex flex-wrap gap-2">
                  {contractTags.map((tag) => (
                    <Badge key={tag} value="public" label={`#${tag}`} className="font-medium" />
                  ))}
                </div>
              ) : null}
              <div className="mt-5 grid gap-3 text-sm md:grid-cols-2">
                <WalletLine
                  label={copy.creator}
                  wallet={contract.creatorWallet}
                  tone="creator"
                  profiles={contract.profiles}
                />
                <WalletLine
                  label={copy.worker}
                  wallet={contract.workerWallet}
                  tone="worker"
                  profiles={contract.profiles}
                  emptyLabel={pendingApplicants.length > 0 ? copy.pendingWorker : copy.unassignedWorker}
                />
                <WalletLine label={copy.escrow} wallet={contract.escrowAccount || copy.notFunded} />
              </div>
              {!contract.workerWallet && pendingApplicants.length > 0 ? (
                <div className="mt-5 rounded-lg border border-border bg-white p-4">
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <h3 className="text-sm font-semibold uppercase tracking-wide text-amber-700">
                      {copy.applicants}
                    </h3>
                    <Badge value="applicant" label={`${pendingApplicants.length}`} />
                  </div>
                  <div className="space-y-2">
                    {pendingApplicants.map((applicantWallet) => (
                      <div
                        key={applicantWallet}
                        className="flex flex-col gap-2 rounded-md bg-muted p-3 sm:flex-row sm:items-center sm:justify-between"
                      >
                        <div className="flex min-w-0 items-center gap-3">
                          <ProfileAvatar
                            walletAddress={applicantWallet}
                            displayName={getWalletDisplayName(contract.profiles, applicantWallet)}
                            avatarImage={getWalletAvatarImage(contract.profiles, applicantWallet)}
                            className="size-10 shrink-0 rounded-md"
                          />
                          <div className="min-w-0">
                            <p className="truncate font-medium" title={applicantWallet}>
                              {getWalletDisplayLabel(contract.profiles, applicantWallet)}
                            </p>
                            {getWalletDisplayName(contract.profiles, applicantWallet) ? (
                              <p className="truncate text-xs text-muted-foreground" title={applicantWallet}>
                                {shortenWallet(applicantWallet)}
                              </p>
                            ) : null}
                          </div>
                        </div>
                        {role === "creator" && contract.status === "claimed" ? (
                          <Button
                            type="button"
                            className="w-max"
                            onClick={() =>
                              runAction(`accept-claim-${applicantWallet}`, "/api/contracts/accept-claim", {
                                contractId: contract.id,
                                walletAddress,
                                applicantWallet
                              })
                            }
                            disabled={activeAction === `accept-claim-${applicantWallet}`}
                          >
                            <Check className="mr-2 size-4" aria-hidden="true" />
                            {activeAction === `accept-claim-${applicantWallet}`
                              ? copy.acceptingClaim
                              : copy.acceptClaim}
                          </Button>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
              <div className="mt-6">
                <ContractProgress
                  totalAmount={contract.totalAmount}
                  fundedAmount={contract.fundedAmount}
                  releasedAmount={contract.releasedAmount}
                  refundedAmount={contract.refundedAmount}
                />
              </div>
              {role === "creator" ? (
                <div className="mt-6 flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => toggleVisibility(!contract.isPublic)}
                    disabled={activeAction === "visibility"}
                  >
                    {contract.isPublic ? (
                      <EyeOff className="mr-2 size-4" aria-hidden="true" />
                    ) : (
                      <Eye className="mr-2 size-4" aria-hidden="true" />
                    )}
                    {activeAction === "visibility"
                      ? copy.saveVisibility
                      : contract.isPublic
                        ? copy.makePrivate
                        : copy.makePublic}
                  </Button>
                </div>
              ) : null}
              {role === "creator" && ["open", "claimed", "draft"].includes(contract.status) ? (
                <div className="mt-6 rounded-lg bg-muted p-4">
                  <div className="grid gap-3">
                    <div className="grid gap-2">
                      <Label>{copy.cancelReason}</Label>
                      <Textarea
                        value={cancelReason}
                        onChange={(event) => setCancelReason(event.target.value)}
                        placeholder={copy.cancelReasonPlaceholder}
                      />
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {!contract.workerWallet ? (
                        <Button
                          type="button"
                          variant="danger"
                          onClick={() => void deleteProject()}
                          disabled={activeAction === "delete"}
                        >
                          <Trash2 className="mr-2 size-4" aria-hidden="true" />
                          {activeAction === "delete" ? copy.deletingProject : copy.deleteProject}
                        </Button>
                      ) : null}
                      {contract.status === "draft" ? (
                        <Button
                          type="button"
                          onClick={() =>
                            runEscrowAction({
                              actionKey: "fund",
                              prepareUrl: "/api/transactions/prepare-fund",
                              prepareBody: {
                                contractId: contract.id,
                                walletAddress
                              },
                              directUrl: "/api/contracts/fund",
                              directBody: {
                                contractId: contract.id,
                                walletAddress
                              },
                              confirmUrl: "/api/transactions/confirm-fund",
                              confirmBody: {
                                contractId: contract.id,
                                walletAddress
                              }
                            })
                          }
                          disabled={activeAction === "fund"}
                        >
                          <CircleDollarSign className="mr-2 size-4" aria-hidden="true" />
                          {activeAction === "fund" ? copy.funding : copy.fundContract}
                        </Button>
                      ) : null}
                      {contract.workerWallet ? (
                        <Button
                          type="button"
                          variant="danger"
                          onClick={() =>
                            runAction("cancel", "/api/contracts/cancel", {
                              contractId: contract.id,
                              walletAddress,
                              reason: cancelReason || undefined
                            })
                          }
                          disabled={activeAction === "cancel"}
                        >
                          <Ban className="mr-2 size-4" aria-hidden="true" />
                          {activeAction === "cancel" ? copy.cancelling : copy.cancelDraft}
                        </Button>
                      ) : null}
                    </div>
                  </div>
                </div>
              ) : null}
              {role !== "creator" &&
              role !== "worker" &&
              role !== "applicant" &&
              ["open", "claimed"].includes(contract.status) ? (
                <div className="mt-6 rounded-lg bg-muted p-4">
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      onClick={() =>
                        runAction("claim", "/api/contracts/claim", {
                          contractId: contract.id,
                          walletAddress
                        })
                      }
                      disabled={!walletAddress || activeAction === "claim"}
                      >
                      <Wallet className="mr-2 size-4" aria-hidden="true" />
                      {activeAction === "claim" ? copy.claimingProject : copy.claimProject}
                    </Button>
                  </div>
                </div>
              ) : null}
              {role === "applicant" && contract.status === "claimed" ? (
                <p className="mt-6 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                  {copy.applicantPendingNotice}
                </p>
              ) : null}
            </Card>

            {pendingEscrowTransaction && ["creator", "worker"].includes(role) ? (
              <EscrowTransactionStatus
                transaction={pendingEscrowTransaction}
                isRetrying={activeAction === "retry-confirmation"}
                onRetry={() => void retryTransactionConfirmation()}
              />
            ) : null}

            {contract.status === "disputed" && activeDispute && ["creator", "worker"].includes(role) ? (
              <DisputeResolutionPanel
                dispute={activeDispute}
                walletAddress={walletAddress}
                activeAction={activeAction}
                onPropose={(outcome) =>
                  void runAction(
                    outcome === "release_to_worker" ? "propose-release" : "propose-refund",
                    "/api/milestones/propose-dispute-resolution",
                    {
                      contractId: contract.id,
                      milestoneId: activeDispute.milestoneId,
                      walletAddress,
                      outcome
                    }
                  )
                }
                onAccept={() =>
                  void runAction("accept-resolution", "/api/milestones/accept-dispute-resolution", {
                    contractId: contract.id,
                    milestoneId: activeDispute.milestoneId,
                    walletAddress,
                    idempotencyKey: crypto.randomUUID()
                  })
                }
              />
            ) : null}

            <section className="space-y-4">
              <h2 className="text-xl font-semibold">{copy.milestones}</h2>
              {contract.milestones.map((milestone) => {
                const requestedRevisionNote = getLatestRevisionRequestNote(contract, milestone.id);
                const displayedStatus =
                  contract.status === "cancelled" && milestone.status !== "released"
                    ? "cancelled"
                    : milestone.status;

                return (
                  <Card key={milestone.id}>
                  <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-lg font-semibold">
                          {milestone.index}. {milestone.title}
                        </h3>
                        <Badge value={displayedStatus} />
                      </div>
                      <p className="mt-2 text-sm leading-6 text-muted-foreground">
                        {milestone.description || copy.noDescription}
                      </p>
                    </div>
                    <div className="shrink-0 text-left md:text-right">
                      <p className="font-semibold">{formatUsdc(milestone.amount, locale)}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatDate(milestone.dueAt, locale, messages.dates.noDueDate)}
                      </p>
                    </div>
                  </div>

                  <ProofHistory milestone={milestone} />

                  <MilestoneActions
                    milestone={milestone}
                    contractStatus={contract.status}
                    role={role}
                    activeAction={activeAction}
                    draft={proofDrafts[milestone.id] ?? { note: "", proofUrl: "" }}
                    revisionNote={revisionDrafts[milestone.id] ?? ""}
                    requestedRevisionNote={requestedRevisionNote}
                    disputeReason={disputeDrafts[milestone.id] ?? ""}
                    onDraftChange={(patch) => updateDraft(milestone.id, patch)}
                    onRevisionNoteChange={(note) => updateRevisionDraft(milestone.id, note)}
                    onDisputeReasonChange={(reason) => updateDisputeDraft(milestone.id, reason)}
                    onSubmitProof={() => submitProof(milestone)}
                    onApprove={() =>
                      runAction(`approve-${milestone.id}`, "/api/milestones/approve", {
                        contractId: contract.id,
                        milestoneId: milestone.id,
                        walletAddress
                      })
                    }
                    onRequestRevision={() =>
                      runAction(`revision-${milestone.id}`, "/api/milestones/request-revision", {
                        contractId: contract.id,
                        milestoneId: milestone.id,
                        walletAddress,
                        note: revisionDrafts[milestone.id]
                      })
                    }
                    onDispute={() =>
                      runAction(`dispute-${milestone.id}`, "/api/milestones/dispute", {
                        contractId: contract.id,
                        milestoneId: milestone.id,
                        walletAddress,
                        reason: disputeDrafts[milestone.id]
                      })
                    }
                    onRelease={() =>
                      runEscrowAction({
                        actionKey: `release-${milestone.id}`,
                        prepareUrl: "/api/transactions/prepare-release",
                        prepareBody: {
                          contractId: contract.id,
                          milestoneId: milestone.id,
                          walletAddress
                        },
                        directUrl: "/api/milestones/release",
                        directBody: {
                          contractId: contract.id,
                          milestoneId: milestone.id,
                          walletAddress
                        },
                        confirmUrl: "/api/transactions/confirm-release",
                        confirmBody: {
                          contractId: contract.id,
                          milestoneId: milestone.id,
                          walletAddress
                        }
                      })
                    }
                  />
                  </Card>
                );
              })}
            </section>
          </div>

          <aside className="space-y-6 lg:sticky lg:top-24 lg:h-max">
            <ContractDiscussion
              contract={contract}
              walletAddress={walletAddress}
              onContractUpdate={setContract}
              onStatusMessage={setSuccessMessage}
            />
            <Card>
              <h2 className="mb-4 text-lg font-semibold">{copy.timeline}</h2>
              <EventTimeline events={contract.events} profiles={contract.profiles} />
            </Card>
          </aside>
        </div>
      )}
    </div>
  );
}

type ContractDetailCopy = {
  applicationSubmitted: string;
  workerSelected: string;
  contractFunded: string;
  proofSubmitted: string;
  milestoneApproved: string;
  revisionRequested: string;
  paymentReleased: string;
  visibilityUpdated: string;
  titleRenamed: string;
  projectCancelled: string;
  disputeOpened: string;
  disputeResolutionProposed: string;
  disputeResolutionAccepted: string;
};

function getSuccessMessage(actionKey: string, copy: ContractDetailCopy) {
  if (actionKey === "claim") {
    return copy.applicationSubmitted;
  }

  if (actionKey.startsWith("accept-claim-")) {
    return copy.workerSelected;
  }

  if (actionKey === "fund") {
    return copy.contractFunded;
  }

  if (actionKey.startsWith("submit-")) {
    return copy.proofSubmitted;
  }

  if (actionKey.startsWith("approve-")) {
    return copy.milestoneApproved;
  }

  if (actionKey.startsWith("revision-")) {
    return copy.revisionRequested;
  }

  if (actionKey.startsWith("release-")) {
    return copy.paymentReleased;
  }

  if (actionKey === "visibility") {
    return copy.visibilityUpdated;
  }

  if (actionKey === "rename") {
    return copy.titleRenamed;
  }

  if (actionKey === "cancel") {
    return copy.projectCancelled;
  }

  if (actionKey.startsWith("dispute-")) {
    return copy.disputeOpened;
  }

  if (actionKey.startsWith("propose-")) {
    return copy.disputeResolutionProposed;
  }

  if (actionKey === "accept-resolution") {
    return copy.disputeResolutionAccepted;
  }

  return "";
}
