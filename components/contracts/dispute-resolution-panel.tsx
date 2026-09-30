"use client";

import { AlertTriangle } from "lucide-react";
import { useLocale } from "@/components/i18n/locale-provider";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { SerializedDispute } from "@/types/contract";

type DisputeOutcome = "release_to_worker" | "refund_to_creator";

export function DisputeResolutionPanel({
  dispute,
  releaseAmount,
  refundAmount,
  workerWallet,
  creatorWallet,
  canSettle,
  canArbitrate,
  walletAddress,
  activeAction,
  onPropose,
  onAccept,
  onArbitrate,
}: {
  dispute: SerializedDispute;
  releaseAmount: string;
  refundAmount: string;
  workerWallet: string;
  creatorWallet: string;
  canSettle: boolean;
  canArbitrate: boolean;
  walletAddress: string;
  activeAction: string;
  onPropose: (outcome: DisputeOutcome) => void;
  onAccept: () => void;
  onArbitrate: (outcome: DisputeOutcome) => void;
}) {
  const { messages, locale } = useLocale();
  const copy = messages.contractDetail;

  return (
    <Card>
      <div className="flex items-start gap-3">
        <AlertTriangle
          className="mt-0.5 size-5 text-danger"
          aria-hidden="true"
        />
        <div className="min-w-0 flex-1">
          <h2 className="font-semibold">{copy.disputeResolutionTitle}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {canArbitrate
              ? copy.arbitratorResolutionDescription
              : copy.disputeResolutionDescription}
          </p>
          <p className="mt-3 text-sm">
            {dispute.reason ??
              (locale === "zh"
                ? "链上发起，未提供文字原因"
                : "Opened on-chain without a text reason")}
          </p>
          <div className="mt-3 space-y-1 break-all text-sm text-muted-foreground">
            <p>
              {locale === "zh"
                ? `放款：${releaseAmount} USDC → ${workerWallet}`
                : `Release: ${releaseAmount} USDC → ${workerWallet}`}
            </p>
            <p>
              {locale === "zh"
                ? `退款：全部剩余本金 ${refundAmount} USDC → ${creatorWallet}`
                : `Refund: all remaining principal ${refundAmount} USDC → ${creatorWallet}`}
            </p>
          </div>
          {!canSettle ? (
            <p className="mt-3 text-sm text-warning">
              {messages.contractDetail.disputeUnavailable}
            </p>
          ) : null}

          {canArbitrate ? (
            <div className="mt-4 flex flex-wrap gap-2">
              <Button
                type="button"
                onClick={() => onArbitrate("release_to_worker")}
                disabled={!canSettle || Boolean(activeAction)}
              >
                {copy.arbitrateRelease}
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => onArbitrate("refund_to_creator")}
                disabled={!canSettle || Boolean(activeAction)}
              >
                {copy.arbitrateRefund}
              </Button>
            </div>
          ) : dispute.status === "open" ? (
            <div className="mt-4 flex flex-wrap gap-2">
              <Button
                type="button"
                onClick={() => onPropose("release_to_worker")}
                disabled={!canSettle || Boolean(activeAction)}
              >
                {copy.proposeRelease}
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => onPropose("refund_to_creator")}
                disabled={!canSettle || Boolean(activeAction)}
              >
                {copy.proposeRefund}
              </Button>
            </div>
          ) : dispute.proposedBy === walletAddress ? (
            <div className="mt-4 space-y-2">
              <p className="text-sm font-medium">
                {dispute.proposedOutcome === "release_to_worker"
                  ? copy.proposedRelease
                  : copy.proposedRefund}
              </p>
              <p className="text-sm text-muted-foreground">
                {copy.proposalWaiting}
              </p>
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              <p className="text-sm font-medium">
                {dispute.proposedOutcome === "release_to_worker"
                  ? copy.proposedRelease
                  : copy.proposedRefund}
              </p>
              <Button
                type="button"
                onClick={onAccept}
                disabled={!canSettle || Boolean(activeAction)}
              >
                {copy.acceptResolution}
              </Button>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}
