"use client";

import { createContext, useCallback, useContext, useMemo, useSyncExternalStore } from "react";
import type { ReactNode } from "react";

const defaultWallets = {
  creator: "creator_demo_wallet_8pQ7n2",
  worker: "worker_demo_wallet_5kL9s1"
};

const walletStorageKey = "vesti.walletAddress";
const walletChangeEvent = "vesti.walletAddress.changed";

type WalletContextValue = {
  walletAddress: string;
  setWalletAddress: (wallet: string) => void;
  defaultWallets: typeof defaultWallets;
};

const WalletContext = createContext<WalletContextValue | null>(null);

function getWalletSnapshot() {
  return window.localStorage.getItem(walletStorageKey) || defaultWallets.creator;
}

function getServerWalletSnapshot() {
  return defaultWallets.creator;
}

function subscribeWalletAddress(onStoreChange: () => void) {
  const handleStorage = (event: StorageEvent) => {
    if (event.key === walletStorageKey) {
      onStoreChange();
    }
  };

  window.addEventListener("storage", handleStorage);
  window.addEventListener(walletChangeEvent, onStoreChange);

  return () => {
    window.removeEventListener("storage", handleStorage);
    window.removeEventListener(walletChangeEvent, onStoreChange);
  };
}

export function WalletProvider({ children }: { children: ReactNode }) {
  const walletAddress = useSyncExternalStore(
    subscribeWalletAddress,
    getWalletSnapshot,
    getServerWalletSnapshot
  );

  const setWalletAddress = useCallback((wallet: string) => {
    window.localStorage.setItem(walletStorageKey, wallet);
    window.dispatchEvent(new Event(walletChangeEvent));
  }, []);

  const value = useMemo(
    () => ({
      walletAddress,
      setWalletAddress,
      defaultWallets
    }),
    [setWalletAddress, walletAddress]
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
