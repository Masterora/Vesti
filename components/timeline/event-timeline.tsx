"use client";

import { useLocale } from "@/components/i18n/locale-provider";
import { Badge } from "@/components/ui/badge";
import { ProfileAvatar } from "@/components/ui/profile-avatar";
import { getWalletAvatarImage, getWalletDisplayName } from "@/lib/profile/display-profiles";
import { formatDateTime, shortenWallet } from "@/lib/utils";
import type { SerializedEvent } from "@/types/contract";
import type { SerializedPublicUserProfile } from "@/types/profile";

function getExplorerUrl(txSig: string) {
  const cluster = process.env.NEXT_PUBLIC_SOLANA_NETWORK ?? "devnet";
  return `https://explorer.solana.com/tx/${encodeURIComponent(txSig)}?cluster=${encodeURIComponent(cluster)}`;
}

export function EventTimeline({
  events = [],
  profiles
}: {
  events?: SerializedEvent[];
  profiles?: SerializedPublicUserProfile[];
}) {
  const { locale, messages } = useLocale();

  if (events.length === 0) {
    return <p className="text-sm text-muted-foreground">{messages.timeline.noEvents}</p>;
  }

  return (
    <ol className="space-y-4">
      {events.map((event) => {
        const displayName = getWalletDisplayName(profiles, event.actorWallet);
        const avatarImage = getWalletAvatarImage(profiles, event.actorWallet);
        const showExplorerLink = Boolean(event.txSig && !event.txSig.startsWith("mock_"));

        return (
          <li key={event.id} className="relative border-l border-border pl-4">
            <span className="absolute -left-1.5 top-1.5 size-3 rounded-full bg-primary" />
            <div className="flex items-start gap-3">
              <ProfileAvatar
                walletAddress={event.actorWallet}
                displayName={displayName}
                avatarImage={avatarImage}
                className="mt-0.5 size-10 shrink-0 rounded-md"
              />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge value={event.eventType} />
                  <span className="text-xs text-muted-foreground">
                    {formatDateTime(event.createdAt, locale)}
                  </span>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  {messages.timeline.actor} {displayName ?? shortenWallet(event.actorWallet)}
                  {displayName ? ` · ${shortenWallet(event.actorWallet)}` : ""}
                  {event.txSig ? ` | ${messages.timeline.transaction} ` : ""}
                  {event.txSig && showExplorerLink ? (
                    <a
                      href={getExplorerUrl(event.txSig)}
                      target="_blank"
                      rel="noreferrer"
                      className="font-medium text-primary hover:underline"
                    >
                      {shortenWallet(event.txSig)}
                    </a>
                  ) : event.txSig ? (
                    shortenWallet(event.txSig)
                  ) : null}
                </p>
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
