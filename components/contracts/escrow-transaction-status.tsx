"use client";

import { RefreshCw } from "lucide-react";
import { useLocale } from "@/components/i18n/locale-provider";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { SerializedEscrowTransaction } from "@/types/contract";

export function EscrowTransactionStatus({
  transaction,
  isRetrying,
  onRetry
}: {
  transaction: SerializedEscrowTransaction;
  isRetrying: boolean;
  onRetry: () => void;
}) {
  const { messages } = useLocale();
  const copy = messages.contractDetail;

  return (
    <Card>
      <h2 className="font-semibold">{copy.transactionStatusTitle}</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        {copy.transactionStatusDescription
          .replace("{action}", transaction.action)
          .replace("{status}", transaction.status)}
      </p>
      {transaction.errorMessage ? (
        <p className="mt-3 text-sm text-destructive">{transaction.errorMessage}</p>
      ) : null}
      {transaction.requiresReviewAt ? (
        <p className="mt-3 text-sm font-medium text-destructive">{copy.transactionManualReview}</p>
      ) : transaction.reconciliationAttempts > 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">
          {copy.transactionRetrying.replace("{count}", String(transaction.reconciliationAttempts))}
        </p>
      ) : null}
      {transaction.txSig && transaction.status === "submitted" ? (
        <Button
          type="button"
          variant="secondary"
          className="mt-4"
          onClick={onRetry}
          disabled={isRetrying}
        >
          <RefreshCw className="mr-2 size-4" aria-hidden="true" />
          {copy.retryConfirmation}
        </Button>
      ) : null}
    </Card>
  );
}
