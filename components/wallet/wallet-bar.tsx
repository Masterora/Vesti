"use client";

import Link from "next/link";
import { LogOut, Wallet } from "lucide-react";
import { useLocale } from "@/components/i18n/locale-provider";
import { ProfileAvatar } from "@/components/ui/profile-avatar";
import { useWallet } from "./wallet-provider";
import { shortenWallet } from "@/lib/utils";

export function WalletBar() {
  const { messages } = useLocale();
  const {
    connectWallet,
    disconnectWallet,
    authError,
    hasInjectedWallet,
    isAuthenticated,
    isConnecting,
    sessionWalletAddress,
    sessionProfile,
  } = useWallet();

  if (!isAuthenticated || !sessionWalletAddress) {
    return (
      <div>
        <button
          type="button"
          className="inline-flex min-h-11 items-center gap-2 rounded-md border border-border bg-surface px-3 text-sm font-semibold transition hover:bg-surface-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus disabled:opacity-50"
          onClick={() => void connectWallet()}
          disabled={isConnecting}
          title={hasInjectedWallet ? messages.wallet.connectTitle : messages.wallet.installTitle}
        >
          <Wallet className="size-4" aria-hidden="true" />
          <span className="hidden sm:inline">{isConnecting ? messages.wallet.connecting : messages.wallet.connect}</span>
        </button>
        {authError ? <p className="sr-only" role="alert">{authError}</p> : null}
      </div>
    );
  }

  return (
    <div className="flex min-w-0 items-center gap-1">
      <Link
        href="/settings/profile"
        className="flex min-h-11 min-w-0 items-center gap-2 rounded-md px-2 transition hover:bg-surface-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
        title={messages.wallet.profile}
      >
        <ProfileAvatar
          walletAddress={sessionWalletAddress}
          displayName={sessionProfile?.displayName}
          avatarImage={sessionProfile?.avatarImage}
          className="size-7 shrink-0 rounded-md"
          loading="eager"
        />
        <span className="hidden max-w-28 truncate text-sm text-foreground md:block">
          {sessionProfile?.displayName || shortenWallet(sessionWalletAddress)}
        </span>
      </Link>
      <button
        type="button"
        className="inline-flex size-11 items-center justify-center rounded-md text-muted-foreground transition hover:bg-surface-raised hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
        onClick={() => void disconnectWallet()}
        title={messages.wallet.disconnect}
        aria-label={messages.wallet.disconnect}
      >
        <LogOut className="size-4" aria-hidden="true" />
      </button>
      {authError ? <p className="sr-only" role="alert">{authError}</p> : null}
    </div>
  );
}
