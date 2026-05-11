import type { Metadata } from "next";
import "./globals.css";
import { AppHeader } from "@/components/layout/app-header";
import { getServerLocale } from "@/lib/i18n/server-locale";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: "Vesti",
  description: "USDC milestone escrow MVP for remote work collaboration"
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const locale = await getServerLocale();

  return (
    <html lang={locale === "zh" ? "zh-CN" : "en"} suppressHydrationWarning>
      <body suppressHydrationWarning>
        <Providers initialLocale={locale}>
          <AppHeader />
          <main>{children}</main>
        </Providers>
      </body>
    </html>
  );
}
