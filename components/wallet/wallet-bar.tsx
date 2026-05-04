"use client";

import { UserRound } from "lucide-react";
import { useWallet } from "./wallet-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { shortenWallet } from "@/lib/utils";

export function WalletBar() {
  const { walletAddress, setWalletAddress, defaultWallets } = useWallet();

  return (
    <div className="flex min-w-0 items-center gap-2">
      <div className="hidden min-w-0 items-center gap-2 rounded-md border border-border bg-white px-2 py-1.5 md:flex">
        <UserRound className="size-4 text-muted-foreground" aria-hidden="true" />
        <Input
          aria-label="Wallet address"
          className="h-7 w-52 border-0 px-1 focus:ring-0"
          value={walletAddress}
          onChange={(event) => setWalletAddress(event.target.value)}
        />
      </div>
      <div className="flex items-center gap-1">
        <Button
          type="button"
          variant={walletAddress === defaultWallets.creator ? "primary" : "secondary"}
          className="h-8 px-3"
          onClick={() => setWalletAddress(defaultWallets.creator)}
          title={defaultWallets.creator}
        >
          Creator
        </Button>
        <Button
          type="button"
          variant={walletAddress === defaultWallets.worker ? "primary" : "secondary"}
          className="h-8 px-3"
          onClick={() => setWalletAddress(defaultWallets.worker)}
          title={defaultWallets.worker}
        >
          Worker
        </Button>
      </div>
      <span className="hidden text-xs text-muted-foreground lg:inline">
        {shortenWallet(walletAddress)}
      </span>
    </div>
  );
}
