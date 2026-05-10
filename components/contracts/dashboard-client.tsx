"use client";

import Link from "next/link";
import { RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useLocale } from "@/components/i18n/locale-provider";
import { Button } from "@/components/ui/button";
import { ContractList } from "@/components/contracts/contract-list";
import { useWallet } from "@/components/wallet/wallet-provider";
import { postJson } from "@/lib/api/client";
import type { SerializedContract } from "@/types/contract";

async function fetchContracts(walletAddress?: string) {
  return postJson<SerializedContract[]>("/api/contracts/list", {
    walletAddress: walletAddress?.trim() ? walletAddress : undefined
  });
}

export function DashboardClient() {
  const { messages } = useLocale();
  const { walletAddress } = useWallet();
  const [contracts, setContracts] = useState<SerializedContract[]>([]);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  const loadContracts = useCallback(async () => {
    setIsLoading(true);
    setError("");

    try {
      const data = await fetchContracts(walletAddress);
      setContracts(data);
      setError("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : messages.errors.failedToLoadContracts);
    } finally {
      setIsLoading(false);
    }
  }, [messages.errors.failedToLoadContracts, walletAddress]);

  useEffect(() => {
    let isCurrent = true;

    const loadInitialContracts = async () => {
      try {
        const data = await fetchContracts(walletAddress);

        if (isCurrent) {
          setContracts(data);
          setError("");
        }
      } catch (caught) {
        if (isCurrent) {
          setError(caught instanceof Error ? caught.message : messages.errors.failedToLoadContracts);
        }
      } finally {
        if (isCurrent) {
          setIsLoading(false);
        }
      }
    };

    void loadInitialContracts();

    return () => {
      isCurrent = false;
    };
  }, [messages.errors.failedToLoadContracts, walletAddress]);

  return (
    <div className="page-shell py-10">
      <div className="mb-7 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-primary">{messages.dashboard.eyebrow}</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight md:text-4xl">{messages.dashboard.title}</h1>
          <p className="mt-3 max-w-2xl text-muted-foreground">{messages.dashboard.description}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="secondary" onClick={loadContracts} disabled={isLoading}>
            <RefreshCw className="mr-2 size-4" aria-hidden="true" />
            {messages.dashboard.refresh}
          </Button>
          <Link href="/contracts/new">
            <Button type="button">{messages.dashboard.newContract}</Button>
          </Link>
        </div>
      </div>

      {error ? <p className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
      {isLoading ? (
        <div className="rounded-lg border border-border bg-white p-8 text-sm text-muted-foreground">
          {messages.dashboard.loading}
        </div>
      ) : (
        <ContractList contracts={contracts} walletAddress={walletAddress} />
      )}
    </div>
  );
}
