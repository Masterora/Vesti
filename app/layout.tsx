import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { Providers } from "./providers";
import { WalletBar } from "@/components/wallet/wallet-bar";

export const metadata: Metadata = {
  title: "Vesti",
  description: "USDC milestone escrow MVP for remote work collaboration"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <Providers>
          <header className="border-b border-border bg-white/86 backdrop-blur">
            <div className="page-shell flex min-h-16 items-center justify-between gap-6 py-3">
              <Link href="/" className="flex items-center gap-3">
                <span className="flex size-9 items-center justify-center rounded-md bg-foreground text-sm font-bold text-white">
                  V
                </span>
                <span>
                  <span className="block text-sm font-semibold tracking-wide">Vesti</span>
                  <span className="block text-xs text-muted-foreground">USDC milestone escrow</span>
                </span>
              </Link>
              <nav className="hidden items-center gap-5 text-sm font-medium text-muted-foreground md:flex">
                <Link href="/dashboard" className="hover:text-foreground">
                  Dashboard
                </Link>
                <Link href="/contracts/new" className="hover:text-foreground">
                  New contract
                </Link>
              </nav>
              <WalletBar />
            </div>
          </header>
          <main>{children}</main>
        </Providers>
      </body>
    </html>
  );
}
