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
  Wallet,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocale } from "@/components/i18n/locale-provider";
import { useRuntimeConfig } from "@/components/layout/runtime-config";
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
  type ProofDraft,
} from "@/components/contracts/milestone-workflow";
import { EventTimeline } from "@/components/timeline/event-timeline";
import { useWallet } from "@/components/wallet/wallet-provider";
import { postJson } from "@/lib/api/client";
import {
  getWalletAvatarImage,
  getWalletDisplayLabel,
  getWalletDisplayName,
} from "@/lib/profile/display-profiles";
import { getPendingApplicantWallets } from "@/lib/domain/contract-applications";
import {
  amountToUnits,
  escrowBalance,
  formatAmountUnits,
} from "@/lib/domain/amount";
import { formatDate, formatUsdc, shortenWallet } from "@/lib/utils";
import type {
  SerializedContract,
  SerializedEscrowTransaction,
  SerializedMilestone,
} from "@/types/contract";

type ContractDetailClientProps = {
  contractId: string;
};

type PreparedEscrowTransaction = {
  summary?: { genesisHash: string; programId: string };
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
  signedTransaction?: string;
  network?: string;
  programId?: string;
  rpcUrl?: string;
  genesisHash?: string;
  confirmUrl: string;
  createdAt: string;
};

const pendingEscrowSubmissionStorageKey = "vesti.pendingEscrowSubmissions";
const legacyPendingEscrowSubmissionStorageKey = "vesti.pendingEscrowSubmission";

function isPendingEscrowSubmission(
  value: unknown,
): value is PendingEscrowSubmission {
  if (!value || typeof value !== "object") {
    return false;
  }

  const parsed = value as Partial<PendingEscrowSubmission>;
  const validConfirmUrl = [
    "/api/transactions/confirm-fund",
    "/api/transactions/confirm-release",
    "/api/transactions/confirm-dispute",
  ].includes(parsed.confirmUrl ?? "");

  return Boolean(
    parsed.contractId &&
    parsed.walletAddress &&
    parsed.transactionId &&
    parsed.txSig &&
    validConfirmUrl &&
    parsed.createdAt &&
    !Number.isNaN(new Date(parsed.createdAt).getTime()),
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
      isPendingEscrowSubmission,
    );

    return submissions;
  } catch {
    return [];
  }
}

function storePendingEscrowSubmission(submission: PendingEscrowSubmission) {
  const submissions = readPendingEscrowSubmissions().filter(
    (current) => current.transactionId !== submission.transactionId,
  );
  submissions.push(submission);
  window.localStorage.setItem(
    pendingEscrowSubmissionStorageKey,
    JSON.stringify(submissions),
  );
  window.localStorage.removeItem(legacyPendingEscrowSubmissionStorageKey);
}

function clearPendingEscrowSubmission(transactionId: string) {
  const submissions = readPendingEscrowSubmissions().filter(
    (current) => current.transactionId !== transactionId,
  );

  if (submissions.length === 0) {
    window.localStorage.removeItem(pendingEscrowSubmissionStorageKey);
  } else {
    window.localStorage.setItem(
      pendingEscrowSubmissionStorageKey,
      JSON.stringify(submissions),
    );
  }
  window.localStorage.removeItem(legacyPendingEscrowSubmissionStorageKey);
}

function getLatestRevisionRequestNote(
  contract: SerializedContract,
  milestoneId: string,
) {
  const event = (contract.events ?? []).find(
    (candidate) =>
      candidate.milestoneId === milestoneId &&
      candidate.eventType === "milestone_revision_requested",
  );

  if (!event?.payload || typeof event.payload !== "object") {
    return "";
  }

  const note = (event.payload as Record<string, unknown>).note;
  return typeof note === "string" ? note : "";
}

async function persistSubmittedEscrowTransaction(
  submission: PendingEscrowSubmission,
) {
  storePendingEscrowSubmission(submission);
  if (submission.signedTransaction) {
    const saved = await postJson<{ status: string }>(
      "/api/transactions/record-signed",
      {
        transactionId: submission.transactionId,
        walletAddress: submission.walletAddress,
        signedTransaction: submission.signedTransaction,
      },
    );
    if (saved.status === "failed") {
      clearPendingEscrowSubmission(submission.transactionId);
      throw new Error("Transaction failed or expired; prepare again.");
    }
  }
  return postJson<{ transactionId: string; status: string }>(
    "/api/transactions/submit",
    submission,
  );
}

async function awaitEscrowConfirmation(url: string, body: unknown) {
  for (let attempt = 0; attempt < 40; attempt++) {
    const result = await postJson<
      ConfirmedEscrowTransaction & { status?: string }
    >(url, body);
    if (result.status === "failed") {
      if (
        body &&
        typeof body === "object" &&
        "transactionId" in body &&
        typeof body.transactionId === "string"
      )
        clearPendingEscrowSubmission(body.transactionId);
      throw new Error("Transaction failed or expired; prepare again.");
    }
    if (result.confirmed) return result;
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }
  throw new Error(
    "Transaction saved; finality is pending. Retry synchronization.",
  );
}

async function fetchContract(contractId: string, walletAddress: string) {
  return postJson<SerializedContract>("/api/contracts/get", {
    contractId,
    walletAddress: walletAddress.trim() ? walletAddress : undefined,
  });
}

export function ContractDetailClient({
  contractId,
}: ContractDetailClientProps) {
  const { walletAddress } = useWallet();
  return (
    <ContractDetailContent
      key={`${contractId}:${walletAddress}`}
      contractId={contractId}
    />
  );
}

function ContractDetailContent({ contractId }: ContractDetailClientProps) {
  const router = useRouter();
  const runtime = useRuntimeConfig();
  const { locale, messages } = useLocale();
  const { walletAddress, signAndSendPreparedTransaction } = useWallet();
  const copy = messages.contractDetail;
  const [contract, setContract] = useState<SerializedContract | null>(null);
  const [titleDraft, setTitleDraft] = useState("");
  const [proofDrafts, setProofDrafts] = useState<Record<string, ProofDraft>>(
    {},
  );
  const [revisionDrafts, setRevisionDrafts] = useState<Record<string, string>>(
    {},
  );
  const [disputeDrafts, setDisputeDrafts] = useState<Record<string, string>>(
    {},
  );
  const [cancelReason, setCancelReason] = useState("");
  const [error, setError] = useState("");
  const [successState, setSuccessState] = useState({
    walletAddress: "",
    message: "",
  });
  const successMessage =
    successState.walletAddress === walletAddress ? successState.message : "";
  const setSuccessMessage = useCallback(
    (message: string) => setSuccessState({ walletAddress, message }),
    [walletAddress],
  );
  const [isLoading, setIsLoading] = useState(Boolean(contractId));
  const [activeAction, setActiveAction] = useState("");
  const [fundDialogOpen, setFundDialogOpen] = useState(false);
  const fundDialogRef = useRef<HTMLDialogElement>(null);
  const fundTriggerRef = useRef<HTMLElement | null>(null);
  const [releaseDialogMilestoneId, setReleaseDialogMilestoneId] = useState<
    string | null
  >(null);
  const releaseDialogRef = useRef<HTMLDialogElement>(null);
  const releaseTriggerRef = useRef<HTMLElement | null>(null);
  const scopeRef = useRef({ walletAddress, contractId, generation: 0 });
  const actionInFlightRef = useRef(false);
  const captureScope = useCallback(() => scopeRef.current, []);
  const isCurrentScope = useCallback(
    (scope: typeof scopeRef.current) => scopeRef.current === scope,
    [],
  );

  useEffect(
    () => () => {
      scopeRef.current = {
        walletAddress,
        contractId,
        generation: scopeRef.current.generation + 1,
      };
    },
    [walletAddress, contractId],
  );

  useEffect(() => {
    const dialog = fundDialogRef.current;
    if (!dialog) return;
    if (fundDialogOpen && !dialog.open) dialog.showModal();
    if (!fundDialogOpen && dialog.open) dialog.close();
  }, [fundDialogOpen]);

  useEffect(() => {
    const dialog = releaseDialogRef.current;
    if (!dialog) return;
    if (releaseDialogMilestoneId && !dialog.open) dialog.showModal();
    if (!releaseDialogMilestoneId && dialog.open) dialog.close();
  }, [releaseDialogMilestoneId]);

  const closeFundDialog = () => {
    fundDialogRef.current?.close();
    setFundDialogOpen(false);
    fundTriggerRef.current?.focus();
  };

  const openFundDialog = () => {
    fundTriggerRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    setFundDialogOpen(true);
  };

  const closeReleaseDialog = () => {
    releaseDialogRef.current?.close();
    setReleaseDialogMilestoneId(null);
    releaseTriggerRef.current?.focus();
  };

  const openReleaseDialog = (milestoneId: string) => {
    releaseTriggerRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    setReleaseDialogMilestoneId(milestoneId);
  };

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

    if (
      contract.disputePolicy === "arbitrator" &&
      walletAddress === contract.arbitratorWallet
    ) {
      return "arbitrator";
    }

    if (getPendingApplicantWallets(contract).includes(walletAddress)) {
      return "applicant";
    }

    return "viewer";
  }, [contract, walletAddress]);
  const activeDispute = contract?.disputes?.find(
    (dispute) => dispute.status !== "resolved",
  );
  const pendingEscrowTransactions =
    contract?.escrowTransactions?.filter(
      (transaction) =>
        transaction.status === "building" ||
        transaction.status === "signed" ||
        transaction.status === "prepared" ||
        transaction.status === "submitted" ||
        transaction.status === "confirmed" ||
        Boolean(transaction.requiresReviewAt),
    ) ?? [];
  const displayedEscrowTransactions =
    pendingEscrowTransactions.length > 0
      ? pendingEscrowTransactions
      : (contract?.escrowTransactions
          ?.filter(
            (transaction) =>
              transaction.status === "failed" &&
              ((transaction.action === "fund" && contract.status === "draft") ||
                (transaction.action === "release" &&
                  contract.milestones.some(
                    (milestone) =>
                      milestone.id === transaction.milestoneId &&
                      milestone.status === "approved",
                  ))),
          )
          .slice(0, 1) ?? []);
  const pendingFunding = contract?.escrowTransactions?.find(
    (transaction) =>
      transaction.action === "fund" &&
      (transaction.status === "building" ||
        transaction.status === "signed" ||
        transaction.status === "prepared" ||
        transaction.status === "submitted" ||
        transaction.status === "confirmed" ||
        Boolean(transaction.requiresReviewAt)),
  );
  const contractTags = contract?.tags ?? [];
  const releaseMilestone = contract?.milestones.find(
    (milestone) => milestone.id === releaseDialogMilestoneId,
  );
  const remainingAfterRelease = (() => {
    if (!contract || !releaseMilestone) return null;
    const balance = escrowBalance(
      contract.fundedAmount,
      contract.releasedAmount,
      contract.refundedAmount,
    );
    if (balance === null) return null;
    try {
      const remaining =
        amountToUnits(balance) - amountToUnits(releaseMilestone.amount);
      return remaining >= BigInt(0) ? formatAmountUnits(remaining) : null;
    } catch {
      return null;
    }
  })();
  const pendingApplicants = useMemo(
    () => (contract ? getPendingApplicantWallets(contract) : []),
    [contract],
  );

  const loadContract = useCallback(async () => {
    if (!contractId) {
      return;
    }

    const scope = captureScope();
    setIsLoading(true);
    setError("");

    try {
      const data = await fetchContract(contractId, walletAddress);
      if (isCurrentScope(scope)) {
        setContract(data);
        setTitleDraft(data.title);
        setError("");
      }
    } catch (caught) {
      if (isCurrentScope(scope))
        setError(
          caught instanceof Error
            ? caught.message
            : messages.errors.failedToLoadContract,
        );
    } finally {
      if (isCurrentScope(scope)) setIsLoading(false);
    }
  }, [
    captureScope,
    contractId,
    isCurrentScope,
    messages.errors.failedToLoadContract,
    walletAddress,
  ]);

  const replaceContractWithCurrentSnapshot = useCallback(
    async (fallback: SerializedContract, scope = captureScope()) => {
      let current = fallback;

      try {
        current = await fetchContract(contractId, walletAddress);
      } catch {
        // Keep the successful mutation response if refreshing the expanded snapshot fails.
      }

      if (isCurrentScope(scope)) {
        setContract(current);
        setTitleDraft(current.title);
      }
      return current;
    },
    [captureScope, contractId, isCurrentScope, walletAddress],
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
    const controller = new AbortController();

    const loadInitialContract = async () => {
      try {
        const data = await postJson<SerializedContract>(
          "/api/contracts/get",
          {
            contractId,
            walletAddress: walletAddress.trim() ? walletAddress : undefined,
          },
          { signal: controller.signal },
        );

        if (isCurrent) {
          setContract(data);
          setTitleDraft(data.title);
          setError("");
        }
      } catch (caught) {
        if (isCurrent) {
          setError(
            caught instanceof Error
              ? caught.message
              : messages.errors.failedToLoadContract,
          );
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
      controller.abort();
    };
  }, [contractId, messages.errors.failedToLoadContract, walletAddress]);

  useEffect(() => {
    if (!contractId || !walletAddress) {
      return;
    }

    const pendingSubmissions = readPendingEscrowSubmissions().filter(
      (pending) =>
        pending.contractId === contractId &&
        pending.walletAddress === walletAddress &&
        (!pending.rpcUrl ||
          pending.rpcUrl === process.env.NEXT_PUBLIC_SOLANA_RPC_URL),
    );

    if (pendingSubmissions.length === 0) {
      return;
    }

    let isCurrent = true;

    const recoverSubmission = async () => {
      actionInFlightRef.current = true;
      setActiveAction("retry-confirmation");
      setError("");

      const scope = captureScope();
      for (const pending of pendingSubmissions) {
        if (!isCurrent || !isCurrentScope(scope)) break;
        try {
          await persistSubmittedEscrowTransaction(pending);
          if (!isCurrent || !isCurrentScope(scope)) break;
          const confirmed = await awaitEscrowConfirmation(
            pending.confirmUrl,
            pending,
          );

          if (!confirmed.confirmed) {
            await replaceContractWithCurrentSnapshot(
              confirmed.contract!,
              scope,
            );
            throw new Error(
              locale === "zh"
                ? "交易已保存，等待最终确认，可刷新或重试同步。"
                : "Transaction saved; awaiting finality. Refresh or retry synchronization.",
            );
          }
          if (!confirmed.contract) {
            throw new Error(
              messages.errors.confirmedTransactionMissingContract,
            );
          }

          clearPendingEscrowSubmission(pending.transactionId);
          if (isCurrent && isCurrentScope(scope)) {
            await replaceContractWithCurrentSnapshot(confirmed.contract, scope);
            if (!isCurrentScope(scope)) break;
            setSuccessMessage(copy.transactionReconciled);
          }
        } catch (caught) {
          if (isCurrent && isCurrentScope(scope)) {
            setError(
              caught instanceof Error
                ? caught.message
                : messages.errors.escrowActionFailed,
            );
          }
        }
      }

      if (isCurrent && isCurrentScope(scope)) {
        setActiveAction("");
        actionInFlightRef.current = false;
      }
    };

    void recoverSubmission();

    return () => {
      isCurrent = false;
    };
  }, [
    locale,
    captureScope,
    contractId,
    copy.transactionReconciled,
    isCurrentScope,
    messages.errors.confirmedTransactionMissingContract,
    messages.errors.escrowActionFailed,
    replaceContractWithCurrentSnapshot,
    setSuccessMessage,
    walletAddress,
  ]);

  const runAction = async (actionKey: string, url: string, body: unknown) => {
    const scope = captureScope();
    setActiveAction(actionKey);
    setError("");
    setSuccessMessage("");

    try {
      const data = await postJson<SerializedContract>(url, body);
      await replaceContractWithCurrentSnapshot(data, scope);
      if (isCurrentScope(scope))
        setSuccessMessage(getSuccessMessage(actionKey, copy));
    } catch (caught) {
      if (isCurrentScope(scope))
        setError(
          caught instanceof Error
            ? caught.message
            : messages.errors.actionFailed,
        );
    } finally {
      if (isCurrentScope(scope)) setActiveAction("");
    }
  };

  const retryTransactionConfirmation = async (
    transaction: SerializedEscrowTransaction,
  ) => {
    if (
      !transaction.txSig ||
      (transaction.requiresReviewAt && transaction.errorCode !== "RECONCILIATION_RETRY_LIMIT") ||
      actionInFlightRef.current
    ) {
      return;
    }

    actionInFlightRef.current = true;
    const scope = captureScope();

    const isFunding = transaction.action === "fund";
    setActiveAction("retry-confirmation");
    setError("");
    try {
      const confirmed = await awaitEscrowConfirmation(
        isFunding
          ? "/api/transactions/confirm-fund"
          : transaction.action === "release"
            ? "/api/transactions/confirm-release"
            : "/api/transactions/confirm-dispute",
        {
          contractId: contractId,
          milestoneId: transaction.milestoneId ?? undefined,
          walletAddress,
          transactionId: transaction.id,
          txSig: transaction.txSig,
        },
      );
      if (!confirmed.confirmed) {
        await replaceContractWithCurrentSnapshot(confirmed.contract!, scope);
        throw new Error(
          locale === "zh"
            ? "交易已保存，等待最终确认，可刷新或重试同步。"
            : "Transaction saved; awaiting finality. Refresh or retry synchronization.",
        );
      }
      if (!confirmed.contract) {
        throw new Error(messages.errors.confirmedTransactionMissingContract);
      }
      await replaceContractWithCurrentSnapshot(confirmed.contract, scope);
      clearPendingEscrowSubmission(transaction.id);
      if (isCurrentScope(scope)) setSuccessMessage(copy.transactionReconciled);
    } catch (caught) {
      if (isCurrentScope(scope))
        setError(
          caught instanceof Error
            ? caught.message
            : messages.errors.escrowActionFailed,
        );
    } finally {
      if (isCurrentScope(scope)) {
        setActiveAction("");
        actionInFlightRef.current = false;
      }
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
      confirmBody,
    }: EscrowActionInput) => {
      if (actionInFlightRef.current) return;
      actionInFlightRef.current = true;
      const scope = captureScope();
      setActiveAction(actionKey);
      setError("");
      setSuccessMessage("");

      try {
        const idempotencyKey = crypto.randomUUID();
        const prepared = await postJson<PreparedEscrowTransaction>(prepareUrl, {
          ...prepareBody,
          idempotencyKey,
        });
        if (!isCurrentScope(scope)) return;

        if (prepared.canUseDirectAction) {
          const data = await postJson<SerializedContract>(directUrl, {
            ...directBody,
            idempotencyKey,
          });
          await replaceContractWithCurrentSnapshot(data, scope);
          if (isCurrentScope(scope))
            setSuccessMessage(getSuccessMessage(actionKey, copy));
          return;
        }

        if (!prepared.transaction) {
          throw new Error(messages.errors.preparedTransactionMissing);
        }
        if (!prepared.transactionId) {
          throw new Error(messages.errors.preparedTransactionMissing);
        }

        const txSig = await signAndSendPreparedTransaction(
          prepared.transaction,
          async (signature, signedTransaction) => {
            const submission: PendingEscrowSubmission = {
              ...confirmBody,
              contractId: prepared.contractId,
              milestoneId: prepared.milestoneId,
              walletAddress,
              transactionId: prepared.transactionId!,
              txSig: signature,
              signedTransaction,
              network: process.env.NEXT_PUBLIC_SOLANA_NETWORK,
              rpcUrl: process.env.NEXT_PUBLIC_SOLANA_RPC_URL,
              programId: prepared.summary?.programId,
              genesisHash: prepared.summary?.genesisHash,
              confirmUrl,
              createdAt: new Date().toISOString(),
            };
            storePendingEscrowSubmission(submission);
            await postJson("/api/transactions/record-signed", {
              transactionId: submission.transactionId,
              walletAddress,
              signedTransaction,
            });
          },
          prepared.summary?.genesisHash ?? "",
        );
        if (!isCurrentScope(scope)) return;
        const confirmed = await awaitEscrowConfirmation(confirmUrl, {
          ...confirmBody,
          transactionId: prepared.transactionId,
          txSig,
        });

        if (!confirmed.confirmed) {
          await replaceContractWithCurrentSnapshot(confirmed.contract!, scope);
          throw new Error(
            locale === "zh"
              ? "交易已保存，等待最终确认，可刷新或重试同步。"
              : "Transaction saved; awaiting finality. Refresh or retry synchronization.",
          );
        }
        if (!confirmed.contract) {
          throw new Error(messages.errors.confirmedTransactionMissingContract);
        }

        clearPendingEscrowSubmission(prepared.transactionId);
        await replaceContractWithCurrentSnapshot(confirmed.contract, scope);
        if (isCurrentScope(scope))
          setSuccessMessage(getSuccessMessage(actionKey, copy));
      } catch (caught) {
        if (isCurrentScope(scope)) {
          try {
            const latest = await fetchContract(contractId, walletAddress);
            if (isCurrentScope(scope)) {
              setContract(latest);
              setTitleDraft(latest.title);
            }
          } catch {
            // The signed submission remains in local storage for a later recovery.
          }
          if (isCurrentScope(scope))
            setError(
              caught instanceof Error
                ? caught.message
                : messages.errors.escrowActionFailed,
            );
        }
      } finally {
        if (isCurrentScope(scope)) {
          setActiveAction("");
          actionInFlightRef.current = false;
        }
      }
    },
    [
      locale,
      captureScope,
      contractId,
      copy,
      isCurrentScope,
      messages.errors.confirmedTransactionMissingContract,
      messages.errors.escrowActionFailed,
      messages.errors.preparedTransactionMissing,
      replaceContractWithCurrentSnapshot,
      setSuccessMessage,
      signAndSendPreparedTransaction,
      walletAddress,
    ],
  );

  const runDisputeAction = (
    actionKey: string,
    directUrl: string,
    body: Record<string, unknown>,
    kind: string,
  ) => {
    body = { ...body, expectedProposalVersion: activeDispute?.proposalVersion ?? "0" };
    if (kind.startsWith("dispute_accept")) body.expectedOutcome = activeDispute?.proposedOutcome;
    if (runtime?.escrowMode !== "onchain")
      return runAction(actionKey, directUrl, body);
    const prepareBody: Record<string, unknown> = { ...body, kind };
    delete prepareBody.expectedOutcome;
    return runEscrowAction({
      actionKey,
      prepareUrl: "/api/transactions/prepare-dispute",
      prepareBody,
      directUrl,
      directBody: body,
      confirmUrl: "/api/transactions/confirm-dispute",
      confirmBody: { contractId, milestoneId: body.milestoneId, walletAddress },
    });
  };

  const recoverPendingSubmission = async (pending: PendingEscrowSubmission) => {
    if (actionInFlightRef.current) return;
    actionInFlightRef.current = true;
    const scope = captureScope();
    setActiveAction("retry-confirmation");
    setError("");
    try {
      await persistSubmittedEscrowTransaction(pending);
      if (!isCurrentScope(scope)) return;
      const confirmed = await awaitEscrowConfirmation(
        pending.confirmUrl,
        pending,
      );
      if (!confirmed.contract)
        throw new Error(messages.errors.confirmedTransactionMissingContract);
      clearPendingEscrowSubmission(pending.transactionId);
      await replaceContractWithCurrentSnapshot(confirmed.contract, scope);
      if (isCurrentScope(scope)) setSuccessMessage(copy.transactionReconciled);
    } catch (caught) {
      if (isCurrentScope(scope))
        setError(
          caught instanceof Error
            ? caught.message
            : messages.errors.escrowActionFailed,
        );
    } finally {
      if (isCurrentScope(scope)) {
        setActiveAction("");
        actionInFlightRef.current = false;
      }
    }
  };

  const fundContract = () => {
    if (!contract || contract.status !== "draft" || role !== "creator") return;
    const signedPending = readPendingEscrowSubmissions().find(
      (pending) =>
        pending.contractId === contract.id &&
        pending.walletAddress === walletAddress &&
        pending.confirmUrl === "/api/transactions/confirm-fund",
    );
    if (signedPending) {
      void recoverPendingSubmission(signedPending);
      return;
    }
    if (
      pendingFunding?.status === "submitted" ||
      pendingFunding?.status === "confirmed" ||
      pendingFunding?.requiresReviewAt
    )
      return;
    void runEscrowAction({
      actionKey: "fund",
      prepareUrl: "/api/transactions/prepare-fund",
      prepareBody: { contractId: contract.id, walletAddress },
      directUrl: "/api/contracts/fund",
      directBody: { contractId: contract.id, walletAddress },
      confirmUrl: "/api/transactions/confirm-fund",
      confirmBody: { contractId: contract.id, walletAddress },
    });
  };

  const releasePayment = (milestone: SerializedMilestone) => {
    if (
      !contract ||
      contract.status !== "active" ||
      role !== "creator" ||
      milestone.status !== "approved"
    )
      return;
    const signedPending = readPendingEscrowSubmissions().find(
      (pending) =>
        pending.contractId === contract.id &&
        pending.milestoneId === milestone.id &&
        pending.walletAddress === walletAddress &&
        pending.confirmUrl === "/api/transactions/confirm-release",
    );
    if (signedPending) {
      void recoverPendingSubmission(signedPending);
      return;
    }
    const activeRelease = pendingEscrowTransactions.find(() => true);
    if (
      activeRelease?.status === "submitted" ||
      activeRelease?.status === "confirmed" ||
      activeRelease?.requiresReviewAt
    )
      return;
    void runEscrowAction({
      actionKey: `release-${milestone.id}`,
      prepareUrl: "/api/transactions/prepare-release",
      prepareBody: {
        contractId: contract.id,
        milestoneId: milestone.id,
        walletAddress,
      },
      directUrl: "/api/milestones/release",
      directBody: {
        contractId: contract.id,
        milestoneId: milestone.id,
        walletAddress,
      },
      confirmUrl: "/api/transactions/confirm-release",
      confirmBody: {
        contractId: contract.id,
        milestoneId: milestone.id,
        walletAddress,
      },
    });
  };

  const submitProof = async (milestone: SerializedMilestone) => {
    const draft = proofDrafts[milestone.id] ?? {
      note: "",
      proofUrl: "",
    };

    await runAction(`submit-${milestone.id}`, "/api/milestones/submit-proof", {
      contractId,
      milestoneId: milestone.id,
      walletAddress,
      note: draft.note,
      proofUrl: draft.proofUrl || undefined,
    });
  };

  const updateDraft = (milestoneId: string, patch: Partial<ProofDraft>) => {
    setProofDrafts((current) => ({
      ...current,
      [milestoneId]: {
        note: current[milestoneId]?.note ?? "",
        proofUrl: current[milestoneId]?.proofUrl ?? "",
        ...patch,
      },
    }));
  };

  const updateRevisionDraft = (milestoneId: string, note: string) => {
    setRevisionDrafts((current) => ({
      ...current,
      [milestoneId]: note,
    }));
  };

  const updateDisputeDraft = (milestoneId: string, reason: string) => {
    setDisputeDrafts((current) => ({
      ...current,
      [milestoneId]: reason,
    }));
  };

  const toggleVisibility = async (isPublic: boolean) => {
    await runAction("visibility", "/api/contracts/visibility", {
      contractId,
      walletAddress,
      isPublic,
    });
  };

  const deleteProject = async () => {
    setActiveAction("delete");
    setError("");
    setSuccessMessage("");

    try {
      await postJson<{ deleted: boolean; contractId: string }>(
        "/api/contracts/delete",
        {
          contractId,
          walletAddress,
        },
      );
      router.push("/dashboard?deleted=1");
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : messages.errors.actionFailed,
      );
    } finally {
      setActiveAction("");
    }
  };

  if (!contractId) {
    return (
      <div className="workspace-shell">
        <Card>
          <h1 className="text-xl font-semibold">{copy.missingIdTitle}</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {copy.missingIdDescription}
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div className="workspace-shell">
      {contract && role === "creator" ? (
        <dialog
          ref={fundDialogRef}
          aria-labelledby="fund-confirm-title"
          onClose={() => {
            if (fundDialogRef.current?.open) return;
            setFundDialogOpen(false);
            fundTriggerRef.current?.focus();
          }}
          className="max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-md overflow-y-auto rounded-xl border border-border bg-surface p-6 text-foreground shadow-2xl backdrop:bg-black/70"
        >
          <h2 id="fund-confirm-title" className="text-lg font-semibold">
            {locale === "zh" ? "确认注资" : "Confirm funding"}
          </h2>
          <p className="mt-3 text-sm text-muted-foreground">{contract.title}</p>
          <dl className="mt-4 grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 text-sm">
            <dt className="text-muted-foreground">
              {locale === "zh" ? "金额" : "Amount"}
            </dt>
            <dd className="break-words text-right font-semibold tabular-nums">
              {formatUsdc(contract.totalAmount, locale)} USDC
            </dd>
            <dt className="text-muted-foreground">
              {locale === "zh" ? "收款方" : "Worker"}
            </dt>
            <dd className="break-all text-right font-mono text-xs">
              {contract.workerWallet}
            </dd>
            <dt className="text-muted-foreground">
              {locale === "zh" ? "执行方式" : "Mode"}
            </dt>
            <dd className="text-right">
              {runtime?.escrowMode === "mock" ? "Mock" : "Solana"}
            </dd>
          </dl>
          <p className="mt-4 text-xs text-muted-foreground">
            {runtime?.escrowMode === "mock"
              ? locale === "zh"
                ? "模拟模式将直接更新合约，不会请求钱包签名。"
                : "Mock mode updates the contract directly without a wallet signature."
              : locale === "zh"
                ? "确认后才会准备交易并请求钱包签名。"
                : "The transaction is prepared and sent to your wallet only after confirmation."}
          </p>
          <div className="mt-6 flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={closeFundDialog}>
              {locale === "zh" ? "取消" : "Cancel"}
            </Button>
            <Button
              type="button"
              onClick={() => {
                closeFundDialog();
                fundContract();
              }}
            >
              {locale === "zh" ? "确认注资" : "Confirm funding"}
            </Button>
          </div>
        </dialog>
      ) : null}
      {contract && releaseMilestone && role === "creator" ? (
        <dialog
          ref={releaseDialogRef}
          aria-labelledby="release-confirm-title"
          onClose={() => {
            if (releaseDialogRef.current?.open) return;
            setReleaseDialogMilestoneId(null);
            releaseTriggerRef.current?.focus();
          }}
          className="max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-md overflow-y-auto rounded-xl border border-border bg-surface p-6 text-foreground shadow-2xl backdrop:bg-black/70"
        >
          <h2 id="release-confirm-title" className="text-lg font-semibold">
            {locale === "zh" ? "确认释放付款" : "Confirm payment release"}
          </h2>
          <p className="mt-3 text-sm text-muted-foreground">
            {releaseMilestone.index}. {releaseMilestone.title}
          </p>
          <dl className="mt-4 grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 text-sm">
            <dt className="text-muted-foreground">
              {locale === "zh" ? "收款方" : "Recipient"}
            </dt>
            <dd className="break-all text-right font-mono text-xs">
              {contract.workerWallet}
            </dd>
            <dt className="text-muted-foreground">
              {locale === "zh" ? "本次付款" : "Payment"}
            </dt>
            <dd className="break-words text-right font-semibold tabular-nums">
              {formatUsdc(releaseMilestone.amount, locale)} USDC
            </dd>
            <dt className="text-muted-foreground">
              {locale === "zh" ? "付款后托管余额" : "Escrow after payment"}
            </dt>
            <dd className="break-words text-right font-semibold tabular-nums">
              {remainingAfterRelease === null
                ? "—"
                : `${formatUsdc(remainingAfterRelease, locale)} USDC`}
            </dd>
            <dt className="text-muted-foreground">
              {locale === "zh" ? "执行方式" : "Mode"}
            </dt>
            <dd className="text-right">
              {runtime?.escrowMode === "mock"
                ? "Mock"
                : runtime?.escrowMode === "onchain"
                  ? "Solana"
                  : "—"}
            </dd>
          </dl>
          <p className="mt-4 text-xs text-muted-foreground">
            {runtime?.escrowMode === "mock"
              ? locale === "zh"
                ? "模拟模式会直接更新里程碑，不会请求钱包签名。"
                : "Mock mode updates the milestone directly without a wallet signature."
              : locale === "zh"
                ? "确认后才会准备付款交易并请求钱包签名；链上确认前不会标记已付款。"
                : "The payment transaction is prepared after confirmation. Payment is recorded only after network reconciliation."}
          </p>
          <div className="mt-6 flex justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={closeReleaseDialog}
            >
              {locale === "zh" ? "取消" : "Cancel"}
            </Button>
            <Button
              type="button"
              disabled={remainingAfterRelease === null}
              onClick={() => {
                closeReleaseDialog();
                releasePayment(releaseMilestone);
              }}
            >
              {locale === "zh" ? "确认付款" : "Confirm payment"}
            </Button>
          </div>
        </dialog>
      ) : null}
      <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-[28px] font-semibold leading-9 tracking-tight">
            {contract?.title ??
              (isLoading ? copy.loadingTitle : copy.notFoundTitle)}
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
          <Button
            type="button"
            variant="secondary"
            onClick={loadContract}
            disabled={isLoading}
          >
            <RefreshCw className="mr-2 size-4" aria-hidden="true" />
            {copy.refresh}
          </Button>
          <Link href="/dashboard">
            <Button type="button" variant="secondary">
              {copy.dashboard}
            </Button>
          </Link>
        </div>
      </div>

      {error ? (
        <p className="mb-4 rounded-md border border-danger/30 bg-danger/10 p-3 text-sm text-danger">
          {error}
        </p>
      ) : null}
      {!error && successMessage ? (
        <p className="mb-4 rounded-md border border-success/30 bg-success/10 p-3 text-sm text-success">
          {successMessage}
        </p>
      ) : null}

      {contract ? (
        <nav
          className="mb-6 flex gap-1 overflow-x-auto border-b border-border"
          aria-label={
            locale === "zh" ? "合约详情分区" : "Contract detail sections"
          }
        >
          {[
            ["overview", locale === "zh" ? "概览" : "Overview"],
            ["milestones", copy.milestones],
            ...(pendingApplicants.length
              ? [["applicants", copy.applicants]]
              : []),
            ["discussion", copy.discussion],
            ["activity", copy.timeline],
          ].map(([target, label]) => (
            <a
              key={target}
              href={`#${target}`}
              className="min-h-11 whitespace-nowrap border-b-2 border-transparent px-3 py-3 text-sm text-muted-foreground transition hover:border-primary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
            >
              {label}
            </a>
          ))}
        </nav>
      ) : null}

      {isLoading ? (
        <Card>{copy.loadingTitle}...</Card>
      ) : !contract ? null : (
        <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
          <div className="space-y-6">
            <Card id="overview" className="scroll-mt-24">
              <div className="flex flex-wrap items-center gap-2">
                <Badge value={contract.status} />
                <Badge
                  value={contract.isPublic ? "public" : "private"}
                  label={contract.isPublic ? copy.public : copy.private}
                />
              </div>
              {contract.status === "open" ? (
                <p className="mt-4 rounded-md border border-focus/30 bg-focus/10 p-3 text-sm text-focus">
                  {copy.openNotice}
                </p>
              ) : null}
              {contract.status === "claimed" ? (
                <p className="mt-4 rounded-md border border-warning/30 bg-warning/10 p-3 text-sm text-warning">
                  {pendingApplicants.length === 1
                    ? copy.claimedNoticeSingle
                    : copy.claimedNotice}
                </p>
              ) : null}
              {contract.status === "draft" ? (
                <p className="mt-4 rounded-md border border-success/30 bg-success/10 p-3 text-sm text-success">
                  {copy.matchedNotice}
                </p>
              ) : null}
              {role === "creator" &&
              ["open", "claimed", "draft", "active", "disputed"].includes(
                contract.status,
              ) ? (
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
                          title: titleDraft,
                        })
                      }
                      disabled={
                        !titleDraft.trim() ||
                        titleDraft.trim() === contract.title ||
                        activeAction === "rename"
                      }
                    >
                      <PencilLine className="mr-2 size-4" aria-hidden="true" />
                      {activeAction === "rename"
                        ? copy.renamingTitle
                        : copy.renameTitle}
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
                    <Badge
                      key={tag}
                      value="public"
                      label={`#${tag}`}
                      className="font-medium"
                    />
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
                  emptyLabel={
                    pendingApplicants.length > 0
                      ? copy.pendingWorker
                      : copy.unassignedWorker
                  }
                />
                <WalletLine
                  label={copy.escrow}
                  wallet={contract.escrowAccount || copy.notFunded}
                />
                <div className="rounded-md border border-border p-3">
                  <p className="text-xs text-muted-foreground">
                    {messages.newContract.disputePolicyLabel}
                  </p>
                  <p className="mt-1 font-medium">
                    {contract.disputePolicy === "arbitrator"
                      ? messages.newContract.arbitratorPolicy
                      : messages.newContract.bilateralPolicy}
                  </p>
                </div>
                {contract.disputePolicy === "arbitrator" &&
                contract.arbitratorWallet ? (
                  <WalletLine
                    label={messages.newContract.arbitratorWalletLabel}
                    wallet={contract.arbitratorWallet}
                  />
                ) : null}
              </div>
              {!contract.workerWallet && pendingApplicants.length > 0 ? (
                <div
                  id="applicants"
                  className="mt-5 scroll-mt-24 rounded-md border border-border bg-surface-raised p-4"
                >
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <h3 className="text-sm font-semibold uppercase tracking-wide text-warning">
                      {copy.applicants}
                    </h3>
                    <Badge
                      value="applicant"
                      label={`${pendingApplicants.length}`}
                    />
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
                            displayName={getWalletDisplayName(
                              contract.profiles,
                              applicantWallet,
                            )}
                            avatarImage={getWalletAvatarImage(
                              contract.profiles,
                              applicantWallet,
                            )}
                            className="size-10 shrink-0 rounded-md"
                          />
                          <div className="min-w-0">
                            <p
                              className="truncate font-medium"
                              title={applicantWallet}
                            >
                              {getWalletDisplayLabel(
                                contract.profiles,
                                applicantWallet,
                              )}
                            </p>
                            {getWalletDisplayName(
                              contract.profiles,
                              applicantWallet,
                            ) ? (
                              <p
                                className="truncate text-xs text-muted-foreground"
                                title={applicantWallet}
                              >
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
                              runAction(
                                `accept-claim-${applicantWallet}`,
                                "/api/contracts/accept-claim",
                                {
                                  contractId: contract.id,
                                  walletAddress,
                                  applicantWallet,
                                },
                              )
                            }
                            disabled={
                              activeAction === `accept-claim-${applicantWallet}`
                            }
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
              {role === "creator" &&
              ["open", "claimed", "draft"].includes(contract.status) ? (
                <div className="mt-6 rounded-lg bg-muted p-4">
                  <div className="grid gap-3">
                    <div className="grid gap-2">
                      <Label>{copy.cancelReason}</Label>
                      <Textarea
                        value={cancelReason}
                        onChange={(event) =>
                          setCancelReason(event.target.value)
                        }
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
                          {activeAction === "delete"
                            ? copy.deletingProject
                            : copy.deleteProject}
                        </Button>
                      ) : null}
                      {contract.status === "draft" ? (
                        <Button
                          type="button"
                          onClick={openFundDialog}
                          disabled={
                            Boolean(activeAction) ||
                            Boolean(pendingFunding) ||
                            contract.chainSyncStatus === "review" ||
                            contract.chainSyncStatus === "degraded"
                          }
                        >
                          <CircleDollarSign
                            className="mr-2 size-4"
                            aria-hidden="true"
                          />
                          {activeAction === "fund"
                            ? copy.funding
                            : copy.fundContract}
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
                              reason: cancelReason || undefined,
                            })
                          }
                          disabled={activeAction === "cancel"}
                        >
                          <Ban className="mr-2 size-4" aria-hidden="true" />
                          {activeAction === "cancel"
                            ? copy.cancelling
                            : copy.cancelDraft}
                        </Button>
                      ) : null}
                    </div>
                  </div>
                </div>
              ) : null}
              {role === "viewer" &&
              ["open", "claimed"].includes(contract.status) ? (
                <div className="mt-6 rounded-lg bg-muted p-4">
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      onClick={() =>
                        runAction("claim", "/api/contracts/claim", {
                          contractId: contract.id,
                          walletAddress,
                        })
                      }
                      disabled={!walletAddress || activeAction === "claim"}
                    >
                      <Wallet className="mr-2 size-4" aria-hidden="true" />
                      {activeAction === "claim"
                        ? copy.claimingProject
                        : copy.claimProject}
                    </Button>
                  </div>
                </div>
              ) : null}
              {role === "applicant" && contract.status === "claimed" ? (
                <p className="mt-6 rounded-md border border-warning/30 bg-warning/10 p-3 text-sm text-warning">
                  {copy.applicantPendingNotice}
                </p>
              ) : null}
            </Card>

            {["creator", "worker", "arbitrator"].includes(role)
              ? displayedEscrowTransactions.map((transaction) => (
                  <EscrowTransactionStatus
                    key={transaction.id}
                    transaction={transaction}
                    isRetrying={Boolean(activeAction)}
                    canRetry={transaction.walletAddress === walletAddress}
                    onRetry={() => {
                      if (
                        transaction.status === "prepared" &&
                        transaction.action !== "fund" &&
                        transaction.action !== "release"
                      ) {
                        void runEscrowAction({
                          actionKey: "resume-dispute",
                          prepareUrl: "/api/transactions/resume",
                          prepareBody: {
                            transactionId: transaction.id,
                            walletAddress,
                          },
                          directUrl: "",
                          directBody: {},
                          confirmUrl: "/api/transactions/confirm-dispute",
                          confirmBody: {
                            contractId,
                            milestoneId: transaction.milestoneId,
                            walletAddress,
                          },
                        });
                      } else if (
                        transaction.status === "prepared" &&
                        transaction.action === "fund"
                      ) {
                        openFundDialog();
                      } else if (
                        transaction.status === "prepared" &&
                        transaction.action === "release"
                      ) {
                        const milestone = contract.milestones.find(
                          (item) => item.id === transaction.milestoneId,
                        );
                        if (milestone) openReleaseDialog(milestone.id);
                      } else {
                        void retryTransactionConfirmation(transaction);
                      }
                    }}
                  />
                ))
              : null}

            {runtime?.escrowMode === "onchain" &&
            ["creator", "worker", "arbitrator"].includes(role) ? (
              <Card>
                <p role="status" className="text-sm">
                  {contract.chainSyncStatus === "review"
                    ? locale === "zh"
                      ? `合约待核查：${contract.chainReviewCode ?? "链上证据不一致"}。当前金额为最后已验证的本金账本。`
                      : `Contract requires review: ${contract.chainReviewCode ?? "chain evidence mismatch"}. Amounts show the last verified principal ledger.`
                    : locale === "zh"
                      ? "链上交易最终确认并核对后才更新合约。"
                      : "The contract updates after finalized chain reconciliation."}
                </p>
                <Button
                  variant="secondary"
                  className="mt-3"
                  disabled={
                    Boolean(activeAction) ||
                    (contract.chainSyncStatus === "review" && !["UNEXPLAINED_WRITABLE_ESCROW", "VERSIONED_ENVELOPE_UNSUPPORTED"].includes(contract.chainReviewCode ?? ""))
                  }
                  onClick={async () => {
                    if (actionInFlightRef.current) return;
                    actionInFlightRef.current = true;
                    setActiveAction("chain-sync");
                    try {
                      await postJson("/api/transactions/chain-sync", {
                        contractId,
                        walletAddress,
                      });
                      setContract(
                        await fetchContract(contractId, walletAddress),
                      );
                    } catch (caught) {
                      setError(
                        caught instanceof Error
                          ? caught.message
                          : "Synchronization failed",
                      );
                    } finally {
                      actionInFlightRef.current = false;
                      setActiveAction("");
                    }
                  }}
                >
                  {locale === "zh" ? "同步链上状态" : "Synchronize chain state"}
                </Button>
              </Card>
            ) : null}

            {contract.status === "disputed" &&
            activeDispute &&
            ["creator", "worker", "arbitrator"].includes(role) ? (
              <DisputeResolutionPanel
                canSettle={
                  runtime?.canSettleDispute === true &&
                  !pendingEscrowTransactions.length &&
                  contract.chainSyncStatus !== "review" &&
                  contract.chainSyncStatus !== "degraded"
                }
                canArbitrate={role === "arbitrator"}
                dispute={activeDispute}
                releaseAmount={
                  contract.milestones.find(
                    (milestone) => milestone.id === activeDispute.milestoneId,
                  )?.amount ?? "0"
                }
                refundAmount={
                  escrowBalance(
                    contract.fundedAmount,
                    contract.releasedAmount,
                    contract.refundedAmount,
                  ) ?? "0"
                }
                workerWallet={contract.workerWallet ?? ""}
                creatorWallet={contract.creatorWallet}
                walletAddress={walletAddress}
                activeAction={activeAction}
                onPropose={(outcome) =>
                  void runDisputeAction(
                    outcome === "release_to_worker"
                      ? "propose-release"
                      : "propose-refund",
                    "/api/milestones/propose-dispute-resolution",
                    {
                      contractId: contract.id,
                      milestoneId: activeDispute.milestoneId,
                      walletAddress,
                      outcome,
                    },
                    "dispute_propose",
                  )
                }
                onAccept={() =>
                  void runDisputeAction(
                    "accept-resolution",
                    "/api/milestones/accept-dispute-resolution",
                    {
                      contractId: contract.id,
                      milestoneId: activeDispute.milestoneId,
                      walletAddress,
                    },
                    activeDispute.proposedOutcome === "release_to_worker"
                      ? "dispute_accept_release"
                      : "dispute_accept_refund",
                  )
                }
                onArbitrate={(outcome) =>
                  void runDisputeAction(
                    outcome === "release_to_worker"
                      ? "arbitrate-release"
                      : "arbitrate-refund",
                    "/api/milestones/arbitrate-dispute-resolution",
                    {
                      contractId: contract.id,
                      milestoneId: activeDispute.milestoneId,
                      walletAddress,
                      outcome,
                    },
                    outcome === "release_to_worker"
                      ? "dispute_arbitrate_release"
                      : "dispute_arbitrate_refund",
                  )
                }
              />
            ) : null}

            <section id="milestones" className="scroll-mt-24 space-y-4">
              <h2 className="text-xl font-semibold">{copy.milestones}</h2>
              {contract.milestones.map((milestone) => {
                const requestedRevisionNote = getLatestRevisionRequestNote(
                  contract,
                  milestone.id,
                );
                const displayedStatus =
                  contract.status === "cancelled" &&
                  milestone.status !== "released"
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
                        <p className="font-semibold">
                          {formatUsdc(milestone.amount, locale)}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {formatDate(
                            milestone.dueAt,
                            locale,
                            messages.dates.noDueDate,
                          )}
                        </p>
                      </div>
                    </div>

                    <ProofHistory milestone={milestone} />

                    <MilestoneActions
                      milestone={milestone}
                      contractStatus={contract.status}
                      role={role}
                      activeAction={activeAction}
                      draft={
                        proofDrafts[milestone.id] ?? { note: "", proofUrl: "" }
                      }
                      revisionNote={revisionDrafts[milestone.id] ?? ""}
                      requestedRevisionNote={requestedRevisionNote}
                      disputeReason={disputeDrafts[milestone.id] ?? ""}
                      onDraftChange={(patch) =>
                        updateDraft(milestone.id, patch)
                      }
                      onRevisionNoteChange={(note) =>
                        updateRevisionDraft(milestone.id, note)
                      }
                      onDisputeReasonChange={(reason) =>
                        updateDisputeDraft(milestone.id, reason)
                      }
                      onSubmitProof={() => submitProof(milestone)}
                      onApprove={() =>
                        runAction(
                          `approve-${milestone.id}`,
                          "/api/milestones/approve",
                          {
                            contractId: contract.id,
                            milestoneId: milestone.id,
                            walletAddress,
                          },
                        )
                      }
                      onRequestRevision={() =>
                        runAction(
                          `revision-${milestone.id}`,
                          "/api/milestones/request-revision",
                          {
                            contractId: contract.id,
                            milestoneId: milestone.id,
                            walletAddress,
                            note: revisionDrafts[milestone.id],
                          },
                        )
                      }
                      onDispute={() =>
                        runDisputeAction(
                          `dispute-${milestone.id}`,
                          "/api/milestones/dispute",
                          {
                            contractId: contract.id,
                            milestoneId: milestone.id,
                            walletAddress,
                            reason: disputeDrafts[milestone.id],
                          },
                          "dispute_open",
                        )
                      }
                      releasePending={
                        pendingEscrowTransactions.length > 0 ||
                        ["review", "degraded"].includes(
                          contract.chainSyncStatus ?? "",
                        )
                      }
                      onRelease={() => openReleaseDialog(milestone.id)}
                    />
                  </Card>
                );
              })}
            </section>
          </div>

          <aside className="space-y-6 lg:sticky lg:top-24 lg:h-max">
            <section id="discussion" className="scroll-mt-24">
              <ContractDiscussion
                contract={contract}
                walletAddress={walletAddress}
                onContractUpdate={setContract}
                onStatusMessage={setSuccessMessage}
              />
            </section>
            <Card id="activity" className="scroll-mt-24">
              <h2 className="mb-4 text-lg font-semibold">{copy.timeline}</h2>
              <EventTimeline
                events={contract.events}
                profiles={contract.profiles}
              />
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

  if (actionKey === "accept-resolution" || actionKey.startsWith("arbitrate-")) {
    return copy.disputeResolutionAccepted;
  }

  return "";
}
