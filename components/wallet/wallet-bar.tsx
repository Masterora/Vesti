"use client";

import { LogOut, UserRound, Wallet } from "lucide-react";
import { useWallet } from "./wallet-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { shortenWallet } from "@/lib/utils";

export function WalletBar() {
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
    isConnecting
  } = useWallet();

  return (
    <div className="flex min-w-0 flex-col items-end gap-1">
      <div className="flex min-w-0 items-center gap-2">
        <div className="hidden min-w-0 items-center gap-2 rounded-md border border-border bg-white px-2 py-1.5 md:flex">
          <UserRound className="size-4 text-muted-foreground" aria-hidden="true" />
          <Input
            aria-label="Wallet address"
            className="h-7 w-52 border-0 px-1 focus:ring-0"
            value={walletAddress}
            onChange={(event) => setWalletAddress(event.target.value)}
            readOnly={isAuthenticated}
            title={isAuthenticated ? "Authenticated wallet session" : "Demo wallet address"}
          />
        </div>
        {isAuthenticated ? (
          <Button
            type="button"
            variant="secondary"
            className="h-8 px-3"
            onClick={() => void disconnectWallet()}
            title="Disconnect wallet session"
          >
            <LogOut className="mr-2 size-4" aria-hidden="true" />
            Disconnect
          </Button>
        ) : (
          <Button
            type="button"
            variant={hasInjectedWallet ? "primary" : "secondary"}
            className="h-8 px-3"
            onClick={() => void connectWallet()}
            disabled={isConnecting}
            title={hasInjectedWallet ? "Connect and sign in with wallet" : "Install a Solana wallet"}
          >
            <Wallet className="mr-2 size-4" aria-hidden="true" />
            {isConnecting ? "Connecting..." : "Connect"}
          </Button>
        )}
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant={!isAuthenticated && walletAddress === defaultWallets.creator ? "primary" : "secondary"}
            className="h-8 px-3"
            onClick={() => void selectDemoWallet(defaultWallets.creator)}
            title={defaultWallets.creator}
          >
            Creator
          </Button>
          <Button
            type="button"
            variant={!isAuthenticated && walletAddress === defaultWallets.worker ? "primary" : "secondary"}
            className="h-8 px-3"
            onClick={() => void selectDemoWallet(defaultWallets.worker)}
            title={defaultWallets.worker}
          >
            Worker
          </Button>
        </div>
        <span className="hidden text-xs text-muted-foreground lg:inline">
          {isAuthenticated ? "signed" : "demo"} {shortenWallet(walletAddress)}
        </span>
      </div>
      {authError ? <p className="max-w-sm text-right text-xs text-danger">{authError}</p> : null}
    </div>
  );
}
