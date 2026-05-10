"use client";

import type { ReactNode } from "react";
import { LocaleProvider } from "@/components/i18n/locale-provider";
import { WalletProvider } from "@/components/wallet/wallet-provider";
import type { Locale } from "@/lib/i18n/messages";

export function Providers({
  children,
  initialLocale
}: {
  children: ReactNode;
  initialLocale: Locale;
}) {
  return (
    <LocaleProvider initialLocale={initialLocale}>
      <WalletProvider>{children}</WalletProvider>
    </LocaleProvider>
  );
}
