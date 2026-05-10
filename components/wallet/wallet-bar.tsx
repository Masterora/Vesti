"use client";

import { LogOut, UserRound, Wallet } from "lucide-react";
import { useLocale } from "@/components/i18n/locale-provider";
import { useWallet } from "./wallet-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { shortenWallet } from "@/lib/utils";

export function WalletBar() {
  const { messages } = useLocale();
  const {
    walletAddress,
    setWalletAddress,
    selectDemoWallet,
    connectWallet,
    disconnectWallet,
    defaultWallets,
    authError,
    hasInjectedWallet,
    isAuthenticated,
    isConnecting,
    sessionWalletAddress,
    demoWalletsEnabled
  } = useWallet();

  return (
    <div className="flex min-w-0 flex-col items-end gap-1">
      <div className="flex min-w-0 items-center gap-2">
        {demoWalletsEnabled ? (
          <div className="hidden min-w-0 items-center gap-2 rounded-md border border-border bg-white px-2 py-1.5 md:flex">
            <UserRound className="size-4 text-muted-foreground" aria-hidden="true" />
            <Input
              aria-label={messages.wallet.walletAddress}
              className="h-7 w-52 border-0 px-1 focus:ring-0"
              value={walletAddress}
              placeholder={messages.wallet.walletAddress}
              onChange={(event) => setWalletAddress(event.target.value)}
              readOnly={isAuthenticated}
              title={
                isAuthenticated
                  ? messages.wallet.authenticatedSession
                  : messages.wallet.demoWalletAddress
              }
            />
          </div>
        ) : (
          <div className="hidden min-w-0 items-center gap-2 rounded-md border border-border bg-white px-3 py-1.5 md:flex">
            <UserRound className="size-4 text-muted-foreground" aria-hidden="true" />
            <span className="max-w-52 truncate text-sm text-muted-foreground" title={sessionWalletAddress ?? undefined}>
              {isAuthenticated && sessionWalletAddress
                ? shortenWallet(sessionWalletAddress)
                : messages.wallet.notConnected}
            </span>
          </div>
        )}
        {isAuthenticated ? (
          <Button
            type="button"
            variant="secondary"
            className="h-8 px-3"
            onClick={() => void disconnectWallet()}
            title={messages.wallet.disconnectTitle}
          >
            <LogOut className="mr-2 size-4" aria-hidden="true" />
            {messages.wallet.disconnect}
          </Button>
        ) : (
          <Button
            type="button"
            variant={hasInjectedWallet ? "primary" : "secondary"}
            className="h-8 px-3"
            onClick={() => void connectWallet()}
            disabled={isConnecting}
            title={hasInjectedWallet ? messages.wallet.connectTitle : messages.wallet.installTitle}
          >
            <Wallet className="mr-2 size-4" aria-hidden="true" />
            {isConnecting ? messages.wallet.connecting : messages.wallet.connect}
          </Button>
        )}
        {demoWalletsEnabled ? (
          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant={!isAuthenticated && walletAddress === defaultWallets.creator ? "primary" : "secondary"}
              className="h-8 px-3"
              onClick={() => void selectDemoWallet(defaultWallets.creator)}
              title={defaultWallets.creator}
            >
              {messages.wallet.demoCreator}
            </Button>
            <Button
              type="button"
              variant={!isAuthenticated && walletAddress === defaultWallets.worker ? "primary" : "secondary"}
              className="h-8 px-3"
              onClick={() => void selectDemoWallet(defaultWallets.worker)}
              title={defaultWallets.worker}
            >
              {messages.wallet.demoWorker}
            </Button>
          </div>
        ) : null}
        <span className="hidden text-xs text-muted-foreground lg:inline">
          {isAuthenticated
            ? `${messages.wallet.signed} ${shortenWallet(sessionWalletAddress ?? walletAddress)}`
            : demoWalletsEnabled && walletAddress
              ? `${messages.wallet.demo} ${shortenWallet(walletAddress)}`
              : messages.wallet.notConnected}
        </span>
      </div>
      {authError ? <p className="max-w-sm text-right text-xs text-danger">{authError}</p> : null}
    </div>
  );
}
