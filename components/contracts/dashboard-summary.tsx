"use client";

import { AlertTriangle, CircleDollarSign, FolderKanban, Workflow } from "lucide-react";
import { useLocale } from "@/components/i18n/locale-provider";
import { Card } from "@/components/ui/card";
import { sumAmountStrings } from "@/lib/domain/amount";
import { formatUsdc } from "@/lib/utils";
import type { SerializedContractListItem } from "@/types/contract";

export function DashboardSummary({ contracts }: { contracts: SerializedContractListItem[] }) {
  const { locale, messages } = useLocale();
  const activeCount = contracts.filter((contract) => contract.status === "active").length;
  const attentionCount = contracts.filter((contract) =>
    ["claimed", "draft", "disputed"].includes(contract.status)
  ).length;
  const releasedAmount = sumAmountStrings(contracts.map((contract) => contract.releasedAmount));
  const metrics = [
    {
      id: "visible",
      label: messages.dashboard.visibleContracts,
      value: String(contracts.length),
      icon: FolderKanban
    },
    {
      id: "active",
      label: messages.dashboard.activeContracts,
      value: String(activeCount),
      icon: Workflow
    },
    {
      id: "attention",
      label: messages.dashboard.attentionRequired,
      value: String(attentionCount),
      icon: AlertTriangle
    },
    {
      id: "released",
      label: messages.dashboard.releasedValue,
      value: formatUsdc(releasedAmount, locale),
      icon: CircleDollarSign
    }
  ];

  return (
    <section className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label={messages.dashboard.summaryLabel}>
      {metrics.map(({ id, label, value, icon: Icon }) => (
        <Card key={id} className="flex items-start justify-between gap-4 p-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
            <p className="mt-2 text-2xl font-semibold tracking-tight">{value}</p>
          </div>
          <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted text-primary">
            <Icon className="size-4" aria-hidden="true" />
          </span>
        </Card>
      ))}
    </section>
  );
}
