"use client";

import bs58 from "bs58";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore
} from "react";
import type { ReactNode } from "react";
import { postJson } from "@/lib/api/client";

const defaultWallets = {
  creator: "creator_demo_wallet_8pQ7n2",
  worker: "worker_demo_wallet_5kL9s1"
};

const walletStorageKey = "vesti.walletAddress";
const walletChangeEvent = "vesti.walletAddress.changed";

type WalletContextValue = {
  walletAddress: string;
  setWalletAddress: (wallet: string) => void;
  selectDemoWallet: (wallet: string) => Promise<void>;
  connectWallet: () => Promise<void>;
  disconnectWallet: () => Promise<void>;
  defaultWallets: typeof defaultWallets;
  authError: string;
  hasInjectedWallet: boolean;
  isAuthenticated: boolean;
  isConnecting: boolean;
  sessionWalletAddress: string | null;
};

const WalletContext = createContext<WalletContextValue | null>(null);

type SolanaInjectedProvider = {
  isPhantom?: boolean;
  isConnected?: boolean;
  publicKey?: {
    toBase58(): string;
  } | null;
  connect(): Promise<{
    publicKey: {
      toBase58(): string;
    };
  }>;
  disconnect?(): Promise<void>;
  signMessage(message: Uint8Array, display?: "utf8" | "hex"): Promise<{
    signature: Uint8Array;
  }>;
};

type AuthChallenge = {
  walletAddress: string;
  nonce: string;
  message: string;
  expiresAt: string;
};

type AuthSession = {
  walletAddress: string | null;
  expiresAt: string | null;
};

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

function getInjectedSolanaWallet() {
  return (window as typeof window & { solana?: SolanaInjectedProvider }).solana;
}

export function WalletProvider({ children }: { children: ReactNode }) {
  const walletAddress = useSyncExternalStore(
    subscribeWalletAddress,
    getWalletSnapshot,
    getServerWalletSnapshot
  );
  const [sessionWalletAddress, setSessionWalletAddress] = useState<string | null>(null);
  const [authError, setAuthError] = useState("");
  const [isConnecting, setIsConnecting] = useState(false);
  const [hasInjectedWallet, setHasInjectedWallet] = useState(false);

  const setWalletAddress = useCallback((wallet: string) => {
    window.localStorage.setItem(walletStorageKey, wallet);
    window.dispatchEvent(new Event(walletChangeEvent));
  }, []);

  useEffect(() => {
    let isCurrent = true;
    const walletCheckId = window.setTimeout(() => {
      if (isCurrent) {
        setHasInjectedWallet(Boolean(getInjectedSolanaWallet()?.signMessage));
      }
    }, 0);

    const loadSession = async () => {
      try {
        const session = await postJson<AuthSession>("/api/auth/session", {});

        if (!isCurrent) {
          return;
        }

        setSessionWalletAddress(session.walletAddress);

        if (session.walletAddress) {
          setWalletAddress(session.walletAddress);
        }
      } catch {
        if (isCurrent) {
          setSessionWalletAddress(null);
        }
      }
    };

    void loadSession();

    return () => {
      isCurrent = false;
      window.clearTimeout(walletCheckId);
    };
  }, [setWalletAddress]);

  const disconnectWallet = useCallback(async () => {
    const wallet = getInjectedSolanaWallet();

    try {
      await postJson<{ ok: boolean }>("/api/auth/logout", {});
      await wallet?.disconnect?.();
      setAuthError("");
    } catch (caught) {
      setAuthError(caught instanceof Error ? caught.message : "Wallet disconnect failed");
    } finally {
      setSessionWalletAddress(null);
      setWalletAddress(defaultWallets.creator);
    }
  }, [setWalletAddress]);

  const selectDemoWallet = useCallback(
    async (wallet: string) => {
      try {
        await disconnectWallet();
      } catch {
        setSessionWalletAddress(null);
      }

      setWalletAddress(wallet);
    },
    [disconnectWallet, setWalletAddress]
  );

  const connectWallet = useCallback(async () => {
    setIsConnecting(true);
    setAuthError("");

    try {
      const wallet = getInjectedSolanaWallet();

      if (!wallet?.signMessage) {
        throw new Error("Install a Solana wallet with message signing support");
      }

      const connection = await wallet.connect();
      const walletAddress = connection.publicKey.toBase58();
      const challenge = await postJson<AuthChallenge>("/api/auth/challenge", {
        walletAddress
      });
      const encodedMessage = new TextEncoder().encode(challenge.message);
      const signedMessage = await wallet.signMessage(encodedMessage, "utf8");
      const session = await postJson<AuthSession>("/api/auth/verify", {
        walletAddress,
        nonce: challenge.nonce,
        signature: bs58.encode(signedMessage.signature)
      });

      setSessionWalletAddress(session.walletAddress);
      setWalletAddress(walletAddress);
    } catch (caught) {
      setAuthError(caught instanceof Error ? caught.message : "Wallet connection failed");
    } finally {
      setIsConnecting(false);
    }
  }, [setWalletAddress]);

  const value = useMemo(
    () => ({
      walletAddress,
      setWalletAddress,
      selectDemoWallet,
      connectWallet,
      disconnectWallet,
      defaultWallets,
      authError,
      hasInjectedWallet,
      isAuthenticated: Boolean(sessionWalletAddress),
      isConnecting,
      sessionWalletAddress
    }),
    [
      authError,
      connectWallet,
      disconnectWallet,
      hasInjectedWallet,
      isConnecting,
      selectDemoWallet,
      sessionWalletAddress,
      setWalletAddress,
      walletAddress
    ]
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
