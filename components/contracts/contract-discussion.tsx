"use client";

import { useMemo, useState } from "react";
import { MessageSquare, Send } from "lucide-react";
import { useLocale } from "@/components/i18n/locale-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { getWalletDisplayLabel, getWalletDisplayName } from "@/lib/display-profiles";
import { Label, Textarea } from "@/components/ui/input";
import { postJson } from "@/lib/api/client";
import { getPendingApplicantWallets } from "@/lib/domain/contract-applications";
import { formatDateTime, shortenWallet } from "@/lib/utils";
import type { SerializedContract, SerializedContractComment } from "@/types/contract";

type ContractDiscussionProps = {
  contract: SerializedContract;
  walletAddress: string;
  onContractUpdate: (contract: SerializedContract) => void;
  onStatusMessage?: (message: string) => void;
};

type DiscussionRole = "creator" | "worker" | "applicant" | "viewer";

function getDiscussionRole(contract: SerializedContract, wallet: string): DiscussionRole {
  if (wallet === contract.creatorWallet) {
    return "creator";
  }

  if (contract.workerWallet && wallet === contract.workerWallet) {
    return "worker";
  }

  if (getPendingApplicantWallets(contract).includes(wallet)) {
    return "applicant";
  }

  return "viewer";
}

function getRoleTextClass(role: DiscussionRole) {
  if (role === "creator") {
    return "text-blue-700";
  }

  if (role === "worker") {
    return "text-emerald-700";
  }

  if (role === "applicant") {
    return "text-amber-700";
  }

  return "text-slate-700";
}

export function ContractDiscussion({
  contract,
  walletAddress,
  onContractUpdate,
  onStatusMessage
}: ContractDiscussionProps) {
  const { messages } = useLocale();
  const copy = messages.contractDetail;
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const [isPosting, setIsPosting] = useState(false);
  const comments = contract.comments ?? [];
  const currentRole = useMemo(
    () => (walletAddress ? getDiscussionRole(contract, walletAddress) : "viewer"),
    [contract, walletAddress]
  );
  const canComment = Boolean(walletAddress) && (contract.isPublic || currentRole !== "viewer");

  const submitComment = async () => {
    if (!draft.trim()) {
      return;
    }

    setIsPosting(true);
    setError("");

    try {
      const updated = await postJson<SerializedContract>("/api/contracts/comments/create", {
        contractId: contract.id,
        walletAddress,
        body: draft.trim()
      });

      onContractUpdate(updated);
      onStatusMessage?.(copy.commentPosted);
      setDraft("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : messages.errors.failedToPostComment);
    } finally {
      setIsPosting(false);
    }
  };

  return (
    <Card>
      <div className="mb-4 flex items-center gap-2">
        <MessageSquare className="size-4 text-muted-foreground" aria-hidden="true" />
        <h2 className="text-lg font-semibold">{copy.discussion}</h2>
      </div>

      {comments.length > 0 ? (
        <div className="max-h-[26rem] space-y-3 overflow-y-auto pr-1">
          {comments.map((comment) => (
            <DiscussionItem key={comment.id} comment={comment} contract={contract} />
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">{copy.discussionEmpty}</p>
      )}

      <div className="mt-5 border-t border-border pt-4">
        {!walletAddress ? (
          <p className="text-sm text-muted-foreground">{copy.discussionConnectHint}</p>
        ) : canComment ? (
          <div className="grid gap-3">
            <div className="grid gap-2">
              <Label>{copy.discussion}</Label>
              <Textarea
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                placeholder={copy.discussionPlaceholder}
                className="min-h-20"
              />
            </div>
            <Button
              type="button"
              className="w-max"
              onClick={() => void submitComment()}
              disabled={!draft.trim() || isPosting}
            >
              <Send className="mr-2 size-4" aria-hidden="true" />
              {isPosting ? copy.postingComment : copy.postComment}
            </Button>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">{copy.discussionPrivateHint}</p>
        )}

        {error ? <p className="mt-3 text-sm text-danger">{error}</p> : null}
      </div>
    </Card>
  );
}

function DiscussionItem({
  comment,
  contract
}: {
  comment: SerializedContractComment;
  contract: SerializedContract;
}) {
  const { locale } = useLocale();
  const role = getDiscussionRole(contract, comment.authorWallet);
  const textToneClass = getRoleTextClass(role);
  const displayName = getWalletDisplayName(contract.profiles, comment.authorWallet);

  return (
    <div className="rounded-lg border border-border bg-muted/40 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <Badge value={role} />
          <div className="min-w-0">
            <p className={`truncate text-sm font-semibold ${textToneClass}`} title={comment.authorWallet}>
              {getWalletDisplayLabel(contract.profiles, comment.authorWallet)}
            </p>
            {displayName ? (
              <p className="truncate text-xs text-muted-foreground" title={comment.authorWallet}>
                {shortenWallet(comment.authorWallet)}
              </p>
            ) : null}
          </div>
        </div>
        <p className="text-xs text-muted-foreground">{formatDateTime(comment.createdAt, locale)}</p>
      </div>
      <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-foreground">{comment.body}</p>
    </div>
  );
}
