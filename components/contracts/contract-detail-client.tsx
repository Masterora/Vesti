"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Check,
  CircleDollarSign,
  Ban,
  PencilLine,
  Eye,
  EyeOff,
  ExternalLink,
  RefreshCw,
  Trash2,
  RotateCcw,
  Send,
  Wallet
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocale } from "@/components/i18n/locale-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Label, Textarea } from "@/components/ui/input";
import { ContractProgress } from "@/components/contracts/contract-progress";
import { ContractDiscussion } from "@/components/contracts/contract-discussion";
import { EventTimeline } from "@/components/timeline/event-timeline";
import { useWallet } from "@/components/wallet/wallet-provider";
import { postJson } from "@/lib/api/client";
import { getWalletDisplayLabel, getWalletDisplayName } from "@/lib/display-profiles";
import { getPendingApplicantWallets } from "@/lib/domain/contract-applications";
import { formatDate, formatDateTime, formatUsdc, shortenWallet } from "@/lib/utils";
import type { SerializedContract, SerializedMilestone } from "@/types/contract";
import type { SerializedPublicUserProfile } from "@/types/profile";

type ContractDetailClientProps = {
  contractId: string;
};

type ProofDraft = {
  note: string;
  proofUrl: string;
};

type PreparedEscrowTransaction = {
  mode: string;
  action: "fund_contract" | "release_milestone";
  contractId: string;
  milestoneId?: string;
  transaction: string | null;
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
  const [successMessage, setSuccessMessage] = useState("");
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

  const runAction = async (actionKey: string, url: string, body: unknown) => {
    setActiveAction(actionKey);
    setError("");
    setSuccessMessage("");

    try {
      const data = await postJson<SerializedContract>(url, body);
      setContract(data);
      setTitleDraft(data.title);
      setSuccessMessage(getSuccessMessage(actionKey, copy));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : messages.errors.actionFailed);
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
        const prepared = await postJson<PreparedEscrowTransaction>(prepareUrl, prepareBody);

        if (prepared.canUseDirectAction) {
          const data = await postJson<SerializedContract>(directUrl, directBody);
          setContract(data);
          setTitleDraft(data.title);
          setSuccessMessage(getSuccessMessage(actionKey, copy));
          return;
        }

        if (!prepared.transaction) {
          throw new Error(messages.errors.preparedTransactionMissing);
        }

        const txSig = await signAndSendPreparedTransaction(prepared.transaction);
        const confirmed = await postJson<ConfirmedEscrowTransaction>(confirmUrl, {
          ...confirmBody,
          txSig
        });

        if (!confirmed.contract) {
          throw new Error(messages.errors.confirmedTransactionMissingContract);
        }

        setContract(confirmed.contract);
        setTitleDraft(confirmed.contract.title);
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
      signAndSendPreparedTransaction
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
            {contract?.title ?? copy.loadingTitle}
          </h1>
          {contract ? (
            <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {copy.idLabel} {contract.displayId}
            </p>
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

      {isLoading || !contract ? (
        <Card>{copy.loadingTitle}...</Card>
      ) : (
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
                  {copy.claimedNotice}
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

            <section className="space-y-4">
              <h2 className="text-xl font-semibold">{copy.milestones}</h2>
              {contract.milestones.map((milestone) => (
                <Card key={milestone.id}>
                  <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-lg font-semibold">
                          {milestone.index}. {milestone.title}
                        </h3>
                        <Badge value={milestone.status} />
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
              ))}
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

  return "";
}

function WalletLine({
  label,
  wallet,
  emptyLabel,
  tone,
  profiles
}: {
  label: string;
  wallet?: string | null;
  emptyLabel?: string;
  tone?: "creator" | "worker" | "applicant";
  profiles?: SerializedPublicUserProfile[];
}) {
  const labelToneClass =
    tone === "creator"
      ? "text-blue-700"
      : tone === "worker"
        ? "text-emerald-700"
        : tone === "applicant"
          ? "text-amber-700"
          : "text-muted-foreground";

  return (
    <div className="flex min-w-0 items-center gap-2 rounded-lg bg-muted p-3">
      <Wallet className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      <div className="min-w-0">
        <p className={`text-xs font-semibold uppercase tracking-wide ${labelToneClass}`}>{label}</p>
        {wallet ? (
          <>
            <p className="truncate font-medium" title={wallet}>
              {getWalletDisplayLabel(profiles, wallet)}
            </p>
            {getWalletDisplayName(profiles, wallet) ? (
              <p className="truncate text-xs text-muted-foreground" title={wallet}>
                {shortenWallet(wallet)}
              </p>
            ) : null}
          </>
        ) : (
          <p className="truncate font-medium" title={emptyLabel}>
            {emptyLabel}
          </p>
        )}
      </div>
    </div>
  );
}

function ProofHistory({ milestone }: { milestone: SerializedMilestone }) {
  const { locale, messages } = useLocale();
  const proofs = milestone.proofSubmissions ?? [];

  if (proofs.length === 0) {
    return <p className="mt-4 text-sm text-muted-foreground">{messages.contractDetail.noProof}</p>;
  }

  return (
    <div className="mt-4 rounded-lg border border-border">
      {proofs.map((proof) => (
        <div key={proof.id} className="border-b border-border p-3 last:border-b-0">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold">
              {messages.contractDetail.proof} v{proof.version}
            </p>
            <p className="text-xs text-muted-foreground">{formatDateTime(proof.createdAt, locale)}</p>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">{proof.note}</p>
          {proof.proofUrl ? (
            <a
              href={proof.proofUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-2 inline-flex items-center text-sm font-semibold text-primary"
            >
              {messages.contractDetail.openProof}
              <ExternalLink className="ml-1 size-3" aria-hidden="true" />
            </a>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function MilestoneActions({
  milestone,
  contractStatus,
  role,
  activeAction,
  draft,
  revisionNote,
  disputeReason,
  onDraftChange,
  onRevisionNoteChange,
  onDisputeReasonChange,
  onSubmitProof,
  onApprove,
  onRequestRevision,
  onDispute,
  onRelease
}: {
  milestone: SerializedMilestone;
  contractStatus: string;
  role: string;
  activeAction: string;
  draft: ProofDraft;
  revisionNote: string;
  disputeReason: string;
  onDraftChange: (patch: Partial<ProofDraft>) => void;
  onRevisionNoteChange: (note: string) => void;
  onDisputeReasonChange: (reason: string) => void;
  onSubmitProof: () => void;
  onApprove: () => void;
  onRequestRevision: () => void;
  onDispute: () => void;
  onRelease: () => void;
}) {
  const { messages } = useLocale();
  const copy = messages.contractDetail;
  const canDispute =
    contractStatus === "active" &&
    ["creator", "worker"].includes(role) &&
    ["ready", "submitted", "revision_requested", "approved"].includes(milestone.status);
  const disputeControl = canDispute ? (
    <div className="mt-5 rounded-lg border border-red-200 bg-red-50 p-4">
      <div className="grid gap-3">
        <div className="grid gap-2">
          <Label>{copy.disputeReason}</Label>
          <Textarea
            value={disputeReason}
            onChange={(event) => onDisputeReasonChange(event.target.value)}
            placeholder={copy.disputePlaceholder}
          />
        </div>
        <Button
          type="button"
          variant="danger"
          className="w-max"
          onClick={onDispute}
          disabled={!disputeReason || activeAction === `dispute-${milestone.id}`}
        >
          <AlertTriangle className="mr-2 size-4" aria-hidden="true" />
          {activeAction === `dispute-${milestone.id}` ? copy.openingDispute : copy.openDispute}
        </Button>
      </div>
    </div>
  ) : null;

  if (role === "worker" && ["ready", "revision_requested"].includes(milestone.status)) {
    return (
      <>
        <div className="mt-5 rounded-lg bg-muted p-4">
          <div className="grid gap-3">
            <div className="grid gap-2">
              <Label>{copy.proofNote}</Label>
              <Textarea
                value={draft.note}
                onChange={(event) => onDraftChange({ note: event.target.value })}
                placeholder={copy.proofNotePlaceholder}
              />
            </div>
            <div className="grid gap-2">
              <Label>{copy.proofUrl}</Label>
              <Input
                value={draft.proofUrl}
                onChange={(event) => onDraftChange({ proofUrl: event.target.value })}
                placeholder={copy.proofUrlPlaceholder}
              />
            </div>
            <Button
              type="button"
              className="w-max"
              onClick={onSubmitProof}
              disabled={!draft.note || activeAction === `submit-${milestone.id}`}
            >
              <Send className="mr-2 size-4" aria-hidden="true" />
              {activeAction === `submit-${milestone.id}` ? copy.submittingProof : copy.submitProof}
            </Button>
          </div>
        </div>
        {disputeControl}
      </>
    );
  }

  if (role === "creator" && milestone.status === "submitted") {
    return (
      <>
        <div className="mt-5 rounded-lg bg-muted p-4">
          <div className="grid gap-3">
            <div className="grid gap-2">
              <Label>{copy.revisionNote}</Label>
              <Textarea
                value={revisionNote}
                onChange={(event) => onRevisionNoteChange(event.target.value)}
                placeholder={copy.revisionPlaceholder}
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                onClick={onApprove}
                disabled={activeAction === `approve-${milestone.id}`}
              >
                <Check className="mr-2 size-4" aria-hidden="true" />
                {activeAction === `approve-${milestone.id}` ? copy.approvingMilestone : copy.approveMilestone}
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={onRequestRevision}
                disabled={!revisionNote || activeAction === `revision-${milestone.id}`}
              >
                <RotateCcw className="mr-2 size-4" aria-hidden="true" />
                {activeAction === `revision-${milestone.id}` ? copy.requestingRevision : copy.requestRevision}
              </Button>
            </div>
          </div>
        </div>
        {disputeControl}
      </>
    );
  }

  if (role === "creator" && milestone.status === "approved") {
    return (
      <>
        <div className="mt-5">
          <Button
            type="button"
            onClick={onRelease}
            disabled={activeAction === `release-${milestone.id}`}
          >
            <CircleDollarSign className="mr-2 size-4" aria-hidden="true" />
            {activeAction === `release-${milestone.id}` ? copy.releasingPayment : copy.releasePayment}
          </Button>
        </div>
        {disputeControl}
      </>
    );
  }

  return disputeControl;
}
