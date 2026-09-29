"use client";

import { useLocale } from "@/components/i18n/locale-provider";
import { getBadgeLabel } from "@/lib/i18n/messages";
import { cn } from "@/lib/utils";

const toneByStatus: Record<string, string> = {
  creator: "bg-focus/10 text-focus",
  worker: "bg-success/10 text-success",
  applicant: "bg-warning/10 text-warning",
  viewer: "bg-muted text-muted-foreground",
  public: "bg-focus/10 text-focus",
  private: "bg-muted text-muted-foreground",
  connected: "bg-focus/10 text-focus",
  open: "bg-focus/10 text-focus",
  claimed: "bg-warning/10 text-warning",
  draft: "bg-muted text-muted-foreground",
  active: "bg-success/10 text-success",
  completed: "bg-success/10 text-success",
  cancelled: "bg-muted text-muted-foreground",
  disputed: "bg-danger/10 text-danger",
  pending: "bg-muted text-muted-foreground",
  ready: "bg-focus/10 text-focus",
  submitted: "bg-warning/10 text-warning",
  revision_requested: "bg-warning/10 text-warning",
  approved: "bg-success/10 text-success",
  released: "bg-success/10 text-success"
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
