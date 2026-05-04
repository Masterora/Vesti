import { Badge } from "@/components/ui/badge";
import { shortenWallet } from "@/lib/utils";
import type { SerializedEvent } from "@/types/contract";

export function EventTimeline({ events = [] }: { events?: SerializedEvent[] }) {
  if (events.length === 0) {
    return <p className="text-sm text-muted-foreground">No events recorded yet.</p>;
  }

  return (
    <ol className="space-y-4">
      {events.map((event) => (
        <li key={event.id} className="relative border-l border-border pl-4">
          <span className="absolute -left-1.5 top-1.5 size-3 rounded-full bg-primary" />
          <div className="flex flex-wrap items-center gap-2">
            <Badge value={event.eventType} />
            <span className="text-xs text-muted-foreground">
              {new Date(event.createdAt).toLocaleString()}
            </span>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Actor {shortenWallet(event.actorWallet)}
            {event.txSig ? ` | ${shortenWallet(event.txSig)}` : ""}
          </p>
        </li>
      ))}
    </ol>
  );
}
