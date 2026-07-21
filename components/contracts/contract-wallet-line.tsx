"use client";

import { Wallet } from "lucide-react";
import { ProfileAvatar } from "@/components/ui/profile-avatar";
import { getWalletAvatarImage, getWalletDisplayLabel, getWalletDisplayName } from "@/lib/profile/display-profiles";
import { shortenWallet } from "@/lib/utils";
import type { SerializedPublicUserProfile } from "@/types/profile";

export function ContractWalletLine({
  label,
  wallet,
  emptyLabel,
  tone,
  profiles
}: {
  label: string;
  wallet?: string | null;
  emptyLabel?: string;
  tone?: "creator" | "worker" | "applicant";
  profiles?: SerializedPublicUserProfile[];
}) {
  const labelToneClass =
    tone === "creator"
      ? "text-blue-700"
      : tone === "worker"
        ? "text-emerald-700"
        : tone === "applicant"
          ? "text-amber-700"
          : "text-muted-foreground";
  const displayName = wallet ? getWalletDisplayName(profiles, wallet) : null;
  const avatarImage = wallet ? getWalletAvatarImage(profiles, wallet) : null;

  return (
    <div className="flex min-w-0 items-center gap-2 rounded-lg bg-muted p-3">
      {wallet && tone ? (
        <ProfileAvatar
          walletAddress={wallet}
          displayName={displayName}
          avatarImage={avatarImage}
          className="size-10 shrink-0 rounded-md"
        />
      ) : (
        <Wallet className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      )}
      <div className="min-w-0">
        <p className={`text-xs font-semibold uppercase tracking-wide ${labelToneClass}`}>{label}</p>
        {wallet ? (
          <>
            <p className="truncate font-medium" title={wallet}>
              {getWalletDisplayLabel(profiles, wallet)}
            </p>
            {displayName ? (
              <p className="truncate text-xs text-muted-foreground" title={wallet}>
                {shortenWallet(wallet)}
              </p>
            ) : null}
          </>
        ) : (
          <p className="truncate font-medium" title={emptyLabel}>
            {emptyLabel}
          </p>
        )}
      </div>
    </div>
  );
}
