import { cn } from "@/lib/utils";

const toneByStatus: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  funded: "bg-amber-100 text-amber-800",
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

export function Badge({ value, className }: { value: string; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex min-h-6 items-center rounded-md px-2 py-1 text-xs font-semibold",
        toneByStatus[value] ?? "bg-muted text-muted-foreground",
        className
      )}
    >
      {value.replaceAll("_", " ")}
    </span>
  );
}
