"use client";

import {
  Connection,
  SendTransactionError,
  Transaction,
  TransactionExpiredBlockheightExceededError,
  TransactionExpiredNonceInvalidError,
  TransactionExpiredTimeoutError
} from "@solana/web3.js";
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
import { useLocale } from "@/components/i18n/locale-provider";
import { postJson } from "@/lib/api/client";
import { translateErrorMessage } from "@/lib/i18n/error-messages";
import type { Locale } from "@/lib/i18n/messages";

const defaultWallets = {
  creator: "creator_demo_wallet_8pQ7n2",
  worker: "worker_demo_wallet_5kL9s1"
};

const demoWalletsEnabled = process.env.NEXT_PUBLIC_DEMO_WALLET_AUTH_ENABLED === "true";
const walletStorageKey = "vesti.walletAddress";
const walletChangeEvent = "vesti.walletAddress.changed";

type WalletContextValue = {
  walletAddress: string;
  setWalletAddress: (wallet: string) => void;
  selectDemoWallet: (wallet: string) => Promise<void>;
  connectWallet: () => Promise<void>;
  disconnectWallet: () => Promise<void>;
  signAndSendPreparedTransaction: (serializedTransaction: string) => Promise<string>;
  defaultWallets: typeof defaultWallets;
  authError: string;
  hasInjectedWallet: boolean;
  isAuthenticated: boolean;
  isConnecting: boolean;
  sessionWalletAddress: string | null;
  demoWalletsEnabled: boolean;
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
  signTransaction?(transaction: Transaction): Promise<Transaction>;
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

function getDefaultWalletAddress() {
  return demoWalletsEnabled ? defaultWallets.creator : "";
}

function getWalletSnapshot() {
  return window.localStorage.getItem(walletStorageKey) || getDefaultWalletAddress();
}

function getServerWalletSnapshot() {
  return getDefaultWalletAddress();
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

function getClientSolanaConnection(locale: Locale) {
  const rpcUrl = process.env.NEXT_PUBLIC_SOLANA_RPC_URL;

  if (!rpcUrl) {
    throw new Error(
      translateErrorMessage(locale, "NEXT_PUBLIC_SOLANA_RPC_URL is required to submit Solana transactions")
    );
  }

  return new Connection(rpcUrl, "confirmed");
}

function deserializePreparedTransaction(serializedTransaction: string) {
  const decoded = window.atob(serializedTransaction);
  const bytes = Uint8Array.from(decoded, (char) => char.charCodeAt(0));

  return Transaction.from(bytes);
}

function formatWalletActionError(error: unknown, locale: Locale) {
  const message = error instanceof Error ? error.message : "Request failed";

  if (
    error instanceof TransactionExpiredBlockheightExceededError ||
    error instanceof TransactionExpiredTimeoutError ||
    error instanceof TransactionExpiredNonceInvalidError ||
    /blockhash/i.test(message)
  ) {
    return translateErrorMessage(locale, "The transaction expired. Please sign again.");
  }

  if (/reject|declin|cancel/i.test(message)) {
    return translateErrorMessage(locale, "You canceled the signature. Contract state did not change.");
  }

  if (error instanceof SendTransactionError) {
    return translateErrorMessage(locale, "The transaction failed on-chain. Contract state did not change.");
  }

  if (/network|fetch|rpc/i.test(message)) {
    return translateErrorMessage(locale, "The Solana network is temporarily unavailable. Please try again.");
  }

  return translateErrorMessage(locale, message);
}

export function WalletProvider({ children }: { children: ReactNode }) {
  const { locale } = useLocale();
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
        } else if (!demoWalletsEnabled) {
          setWalletAddress("");
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
      setAuthError(
        caught instanceof Error
          ? translateErrorMessage(locale, caught.message)
          : translateErrorMessage(locale, "Wallet disconnect failed")
      );
    } finally {
      setSessionWalletAddress(null);
      setWalletAddress(getDefaultWalletAddress());
    }
  }, [locale, setWalletAddress]);

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
        throw new Error(translateErrorMessage(locale, "Install a Solana wallet with message signing support"));
      }

      const connection = await wallet.connect();
      const nextWalletAddress = connection.publicKey.toBase58();
      const challenge = await postJson<AuthChallenge>("/api/auth/challenge", {
        walletAddress: nextWalletAddress
      });
      const encodedMessage = new TextEncoder().encode(challenge.message);
      const signedMessage = await wallet.signMessage(encodedMessage, "utf8");
      const session = await postJson<AuthSession>("/api/auth/verify", {
        walletAddress: nextWalletAddress,
        nonce: challenge.nonce,
        signature: bs58.encode(signedMessage.signature)
      });

      setSessionWalletAddress(session.walletAddress);
      setWalletAddress(nextWalletAddress);
    } catch (caught) {
      setAuthError(
        caught instanceof Error
          ? translateErrorMessage(locale, caught.message)
          : translateErrorMessage(locale, "Wallet connection failed")
      );
    } finally {
      setIsConnecting(false);
    }
  }, [locale, setWalletAddress]);

  const signAndSendPreparedTransaction = useCallback(
    async (serializedTransaction: string) => {
      setAuthError("");

      try {
        if (!sessionWalletAddress) {
          throw new Error(
            translateErrorMessage(
              locale,
              "Connect and sign in with your wallet before submitting an on-chain transaction"
            )
          );
        }

        const wallet = getInjectedSolanaWallet();

        if (!wallet?.signTransaction) {
          throw new Error(
            translateErrorMessage(locale, "Install a Solana wallet with transaction signing support")
          );
        }

        const walletConnection = await wallet.connect();
        const connectedWalletAddress = walletConnection.publicKey.toBase58();

        if (connectedWalletAddress !== sessionWalletAddress) {
          throw new Error(
            translateErrorMessage(
              locale,
              "Reconnect the same wallet you used to sign in before submitting this transaction"
            )
          );
        }

        const signedTransaction = await wallet.signTransaction(
          deserializePreparedTransaction(serializedTransaction)
        );
        const connection = getClientSolanaConnection(locale);
        const signature = await connection.sendRawTransaction(signedTransaction.serialize(), {
          preflightCommitment: "confirmed"
        });

        await connection.confirmTransaction(signature, "confirmed");

        return signature;
      } catch (caught) {
        const message = formatWalletActionError(caught, locale);

        setAuthError(message);
        throw new Error(message);
      }
    },
    [locale, sessionWalletAddress]
  );

  const value = useMemo(
    () => ({
      walletAddress,
      setWalletAddress,
      selectDemoWallet,
      connectWallet,
      disconnectWallet,
      signAndSendPreparedTransaction,
      defaultWallets,
      authError,
      hasInjectedWallet,
      isAuthenticated: Boolean(sessionWalletAddress),
      isConnecting,
      sessionWalletAddress,
      demoWalletsEnabled
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
      signAndSendPreparedTransaction,
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
