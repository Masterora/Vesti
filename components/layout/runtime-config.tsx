"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { postJson } from "@/lib/api/client";

export type PublicRuntimeConfig = {
  escrowMode: "mock" | "onchain";
  network: string;
  canOpenDispute: boolean;
  canSettleDispute: boolean;
};

const RuntimeConfigContext = createContext<PublicRuntimeConfig | null>(null);

export function RuntimeConfigProvider({ children }: { children: React.ReactNode }) {
  const [config, setConfig] = useState<PublicRuntimeConfig | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    void postJson<PublicRuntimeConfig>("/api/runtime/public-config", {}, { signal: controller.signal })
      .then(setConfig)
      .catch(() => setConfig(null));
    return () => controller.abort();
  }, []);

  return <RuntimeConfigContext.Provider value={config}>{children}</RuntimeConfigContext.Provider>;
}

export function useRuntimeConfig() {
  return useContext(RuntimeConfigContext);
}
