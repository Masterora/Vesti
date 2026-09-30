"use client";

import { RefreshCw } from "lucide-react";
import { useLocale } from "@/components/i18n/locale-provider";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { SerializedEscrowTransaction } from "@/types/contract";

export function EscrowTransactionStatus({
  transaction,
  isRetrying,
  canRetry,
  onRetry,
}: {
  transaction: SerializedEscrowTransaction;
  isRetrying: boolean;
  canRetry: boolean;
  onRetry: () => void;
}) {
  const { messages, locale } = useLocale();
  const copy = messages.contractDetail;
  const action =
    transaction.action === "fund"
      ? locale === "zh"
        ? "注资"
        : "Funding"
      : transaction.action === "release"
        ? locale === "zh"
          ? "付款"
          : "Payment"
        : locale === "zh"
          ? "托管"
          : "Escrow";
  const status = transaction.requiresReviewAt
    ? locale === "zh"
      ? "待人工核查"
      : "Manual review required"
    : {
        building: locale === "zh" ? "正在准备交易" : "Preparing transaction",
        signed:
          locale === "zh"
            ? "签名已保存，等待广播"
            : "Signature saved, awaiting broadcast",
        prepared:
          locale === "zh" ? "等待钱包签名" : "Waiting for wallet signature",
        submitted:
          locale === "zh"
            ? "已发送，等待链上确认"
            : "Sent, awaiting network confirmation",
        confirmed:
          locale === "zh"
            ? "已确认，等待业务同步"
            : "Confirmed, awaiting contract update",
        reconciled: locale === "zh" ? "合约已更新" : "Contract updated",
        failed: locale === "zh" ? "处理失败" : "Processing failed",
      }[transaction.status];

  return (
    <Card>
      <h2 className="font-semibold">{copy.transactionStatusTitle}</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        {copy.transactionStatusDescription
          .replace("{action}", action)
          .replace("{status}", status)}
      </p>
      {transaction.txSig ? (
        <p className="mt-3 break-all text-xs text-muted-foreground">
          {transaction.txSig}
        </p>
      ) : null}
      {transaction.errorMessage ? (
        <p className="mt-3 text-sm text-danger">{transaction.errorMessage}</p>
      ) : null}
      {transaction.requiresReviewAt ? (
        <p className="mt-3 text-sm font-medium text-danger">
          {copy.transactionManualReview}
        </p>
      ) : transaction.reconciliationAttempts > 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">
          {copy.transactionRetrying.replace(
            "{count}",
            String(transaction.reconciliationAttempts),
          )}
        </p>
      ) : null}
      {canRetry &&
      (!transaction.requiresReviewAt || transaction.errorCode === "RECONCILIATION_RETRY_LIMIT") &&
      ((transaction.txSig &&
        ["signed", "submitted", "confirmed"].includes(transaction.status)) ||
        (transaction.status === "prepared" && !transaction.txSig)) ? (
        <Button
          type="button"
          variant="secondary"
          className="mt-4"
          onClick={onRetry}
          disabled={isRetrying}
        >
          <RefreshCw className="mr-2 size-4" aria-hidden="true" />
          {transaction.status === "prepared"
            ? transaction.action === "fund"
              ? locale === "zh"
                ? "恢复注资准备"
                : "Resume funding"
              : locale === "zh"
                ? "恢复付款准备"
                : "Resume payment"
            : copy.retryConfirmation}
        </Button>
      ) : null}
      {transaction.status === "failed" &&
      ["fund", "release"].includes(transaction.action) &&
      !transaction.requiresReviewAt ? (
        <p className="mt-3 text-sm text-muted-foreground">
          {transaction.action === "fund"
            ? locale === "zh"
              ? "确认无待处理交易后，可重新发起注资。"
              : "You may prepare funding again after checking that no transaction is pending."
            : locale === "zh"
              ? "确认无待处理交易后，可重新发起付款。"
              : "You may prepare payment again after checking that no transaction is pending."}
        </p>
      ) : null}
    </Card>
  );
}
