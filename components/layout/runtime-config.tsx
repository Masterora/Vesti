"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { postJson } from "@/lib/api/client";

export type PublicRuntimeConfig = {
  escrowMode: "mock" | "onchain";
  network: string;
  releaseId: string | null;
  mintAddress: string | null;
  assetLabel: "test_usdc" | "usdc";
  chainState: "ready" | "paused" | "unavailable" | "mismatch";
  canPrepareFunds: boolean;
  recoveryState: "available" | "paused" | "identity_mismatch" | "temporarily_unavailable";
  maintenancePhase: string;
  maintenanceEpoch: string;
  reasonCode: string | null;
  canOpenDispute: boolean;
  canSettleDispute: boolean;
};

const RuntimeConfigContext = createContext<PublicRuntimeConfig | null>(null);

export function RuntimeConfigProvider({ children }: { children: React.ReactNode }) {
  const [config, setConfig] = useState<PublicRuntimeConfig | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const refresh = () => postJson<PublicRuntimeConfig>("/api/runtime/public-config", {}, { signal: controller.signal })
      .then(setConfig)
      .catch(() => setConfig(null));
    void refresh();
    const interval = window.setInterval(() => void refresh(), 15000);
    return () => { controller.abort(); window.clearInterval(interval); };
  }, []);

  return <RuntimeConfigContext.Provider value={config}>{children}</RuntimeConfigContext.Provider>;
}

export function useRuntimeConfig() {
  return useContext(RuntimeConfigContext);
}
