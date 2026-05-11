"use client";

import { useLocale } from "@/components/i18n/locale-provider";
import { getBadgeLabel } from "@/lib/i18n/messages";
import { cn } from "@/lib/utils";

const toneByStatus: Record<string, string> = {
  creator: "bg-blue-100 text-blue-800",
  worker: "bg-emerald-100 text-emerald-800",
  applicant: "bg-amber-100 text-amber-800",
  viewer: "bg-zinc-100 text-zinc-700",
  public: "bg-fuchsia-100 text-fuchsia-800",
  private: "bg-slate-200 text-slate-800",
  connected: "bg-indigo-100 text-indigo-800",
  demo: "bg-zinc-100 text-zinc-700",
  open: "bg-sky-100 text-sky-800",
  claimed: "bg-amber-100 text-amber-800",
  draft: "bg-muted text-muted-foreground",
  active: "bg-teal-100 text-teal-800",
  completed: "bg-emerald-100 text-emerald-800",
  cancelled: "bg-zinc-200 text-zinc-700",
  disputed: "bg-red-100 text-red-800",
  pending: "bg-muted text-muted-foreground",
  ready: "bg-cyan-100 text-cyan-800",
  submitted: "bg-violet-100 text-violet-800",
  revision_requested: "bg-orange-100 text-orange-800",
  approved: "bg-lime-100 text-lime-800",
  released: "bg-emerald-100 text-emerald-800"
};

export function Badge({
  value,
  className,
  label
}: {
  value: string;
  className?: string;
  label?: string;
}) {
  const { locale } = useLocale();

  return (
    <span
      className={cn(
        "inline-flex min-h-6 items-center rounded-md px-2 py-1 text-xs font-semibold",
        toneByStatus[value] ?? "bg-muted text-muted-foreground",
        className
      )}
    >
      {label ?? getBadgeLabel(locale, value)}
    </span>
  );
}
