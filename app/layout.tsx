import type { Metadata, Viewport } from "next";
import "./globals.css";
import { AppShell } from "@/components/layout/app-shell";
import { getSiteUrl, siteDescription, siteKeywords, siteName, siteTagline } from "@/lib/site";
import { getServerLocale } from "@/lib/i18n/server-locale";
import { Providers } from "./providers";

const brandIconPath = "/brand-mark.svg";

export const metadata: Metadata = {
  metadataBase: getSiteUrl(),
  applicationName: siteName,
  title: {
    default: siteName,
    template: `%s | ${siteName}`
  },
  description: siteDescription,
  keywords: siteKeywords,
  category: "finance",
  manifest: "/manifest.webmanifest",
  alternates: {
    canonical: "/"
  },
  icons: {
    icon: [{ url: brandIconPath, type: "image/svg+xml" }],
    apple: [{ url: brandIconPath, type: "image/svg+xml" }],
    shortcut: [{ url: brandIconPath, type: "image/svg+xml" }]
  },
  openGraph: {
    type: "website",
    url: "/",
    siteName,
    title: siteName,
    description: siteDescription
  },
  twitter: {
    card: "summary_large_image",
    title: siteName,
    description: siteDescription
  },
  appleWebApp: {
    title: siteName,
    capable: true,
    statusBarStyle: "default"
  },
  formatDetection: {
    email: false,
    address: false,
    telephone: false
  },
  other: {
    "mobile-web-app-capable": "yes",
    "apple-mobile-web-app-title": siteTagline
  }
};

export const viewport: Viewport = {
  themeColor: "#17191c",
  colorScheme: "dark"
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const locale = await getServerLocale();

  return (
    <html lang={locale === "zh" ? "zh-CN" : "en"} suppressHydrationWarning>
      <body suppressHydrationWarning>
        <Providers initialLocale={locale}>
          <AppShell>{children}</AppShell>
        </Providers>
      </body>
    </html>
  );
}
