"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";

const defaultWallets = {
  creator: "creator_demo_wallet_8pQ7n2",
  worker: "worker_demo_wallet_5kL9s1"
};

type WalletContextValue = {
  walletAddress: string;
  setWalletAddress: (wallet: string) => void;
  defaultWallets: typeof defaultWallets;
};

const WalletContext = createContext<WalletContextValue | null>(null);

export function WalletProvider({ children }: { children: ReactNode }) {
  const [walletAddress, setWalletAddressState] = useState(defaultWallets.creator);

  useEffect(() => {
    const saved = window.localStorage.getItem("vesti.walletAddress");

    if (saved) {
      setWalletAddressState(saved);
    }
  }, []);

  const setWalletAddress = (wallet: string) => {
    setWalletAddressState(wallet);
    window.localStorage.setItem("vesti.walletAddress", wallet);
  };

  const value = useMemo(
    () => ({
      walletAddress,
      setWalletAddress,
      defaultWallets
    }),
    [walletAddress]
  );

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWallet() {
  const context = useContext(WalletContext);

  if (!context) {
    throw new Error("useWallet must be used within WalletProvider");
  }

  return context;
}
