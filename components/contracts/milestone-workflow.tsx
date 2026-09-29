"use client";

import { AlertTriangle, Check, CircleDollarSign, ExternalLink, RotateCcw, Send } from "lucide-react";
import { useLocale } from "@/components/i18n/locale-provider";
import { useRuntimeConfig } from "@/components/layout/runtime-config";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";
import { formatDateTime } from "@/lib/utils";
import type { SerializedMilestone } from "@/types/contract";

export type ProofDraft = {
  note: string;
  proofUrl: string;
};

export function ProofHistory({ milestone }: { milestone: SerializedMilestone }) {
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

export function MilestoneActions({
  milestone,
  contractStatus,
  role,
  activeAction,
  draft,
  revisionNote,
  requestedRevisionNote,
  disputeReason,
  onDraftChange,
  onRevisionNoteChange,
  onDisputeReasonChange,
  releasePending,
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
  requestedRevisionNote: string;
  disputeReason: string;
  onDraftChange: (patch: Partial<ProofDraft>) => void;
  onRevisionNoteChange: (note: string) => void;
  onDisputeReasonChange: (reason: string) => void;
  releasePending: boolean;
  onSubmitProof: () => void;
  onApprove: () => void;
  onRequestRevision: () => void;
  onDispute: () => void;
  onRelease: () => void;
}) {
  const { messages } = useLocale();
  const runtime = useRuntimeConfig();
  const copy = messages.contractDetail;
  const disputeEligible = contractStatus === "active" &&
    ["creator", "worker"].includes(role) &&
    ["ready", "submitted", "revision_requested", "approved"].includes(milestone.status);
  const canDispute =
    disputeEligible &&
    runtime?.canOpenDispute === true;
  const disputeControl = canDispute ? (
    <div className="mt-5 rounded-md border border-danger/30 bg-danger/10 p-4">
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
  ) : disputeEligible && runtime?.escrowMode === "onchain" ? (
    <p className="mt-5 text-sm text-muted-foreground">{copy.disputeUnavailable}</p>
  ) : null;

  if (
    contractStatus === "active" &&
    role === "worker" &&
    ["ready", "revision_requested"].includes(milestone.status)
  ) {
    return (
      <>
        {milestone.status === "revision_requested" && requestedRevisionNote ? (
          <div className="mt-5 rounded-md border border-warning/30 bg-warning/10 p-4">
            <p className="text-sm font-semibold text-warning">{copy.requestedRevisionNote}</p>
            <p className="mt-1 whitespace-pre-wrap text-sm text-warning">{requestedRevisionNote}</p>
          </div>
        ) : null}
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

  if (contractStatus === "active" && role === "creator" && milestone.status === "submitted") {
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
              <Button type="button" onClick={onApprove} disabled={activeAction === `approve-${milestone.id}`}>
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

  if (contractStatus === "active" && role === "creator" && milestone.status === "approved") {
    return (
      <>
        <div className="mt-5">
          <Button type="button" onClick={onRelease} disabled={releasePending || Boolean(activeAction)}>
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
