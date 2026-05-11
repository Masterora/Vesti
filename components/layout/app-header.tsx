"use client";

import Image from "next/image";
import Link from "next/link";
import { LanguageToggle } from "@/components/i18n/language-toggle";
import { useLocale } from "@/components/i18n/locale-provider";
import { WalletBar } from "@/components/wallet/wallet-bar";

export function AppHeader() {
  const { messages } = useLocale();

  return (
    <header className="border-b border-border bg-white/86 backdrop-blur">
      <div className="page-shell flex min-h-16 items-center justify-between gap-6 py-3">
        <Link href="/" className="flex items-center gap-3">
          <Image
            src="/brand-mark.svg"
            alt="Vesti"
            width={36}
            height={36}
            priority
            className="size-9"
          />
          <span>
            <span className="block text-sm font-semibold tracking-wide">{messages.header.brand}</span>
            <span className="block text-xs text-muted-foreground">{messages.header.tagline}</span>
          </span>
        </Link>
        <nav className="hidden items-center gap-5 text-sm font-medium text-muted-foreground md:flex">
          <Link href="/dashboard" className="hover:text-foreground">
            {messages.header.dashboard}
          </Link>
          <Link href="/contracts/new" className="hover:text-foreground">
            {messages.header.newContract}
          </Link>
        </nav>
        <div className="flex items-center gap-3">
          <LanguageToggle />
          <WalletBar />
        </div>
      </div>
    </header>
  );
}
