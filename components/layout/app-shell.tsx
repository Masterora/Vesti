"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BriefcaseBusiness, FileText, Globe2, Menu, Plus, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { LanguageToggle } from "@/components/i18n/language-toggle";
import { useLocale } from "@/components/i18n/locale-provider";
import { WalletBar } from "@/components/wallet/wallet-bar";
import { cn } from "@/lib/utils";
import { RuntimeConfigProvider, useRuntimeConfig } from "./runtime-config";

const navigation = [
  { href: "/dashboard", label: "工作台", labelEn: "Workspace", icon: BriefcaseBusiness },
  { href: "/contracts", label: "我的合约", labelEn: "My contracts", icon: FileText },
  { href: "/marketplace", label: "公开项目", labelEn: "Marketplace", icon: Globe2 }
];

function Navigation({ pathname, onNavigate }: { pathname: string; onNavigate?: () => void }) {
  return (
    <nav className="mt-7 grid gap-1" aria-label="Primary navigation">
      {navigation.map(({ href, label, labelEn, icon: Icon }) => {
        const active = pathname === href || (href === "/contracts" && pathname.startsWith("/contracts/detail"));
        return (
          <Link
            key={href}
            href={href}
            onClick={onNavigate}
            className={cn(
              "flex min-h-11 items-center gap-3 rounded-md px-3 text-sm font-medium text-muted-foreground transition hover:bg-surface-raised hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus",
              active && "bg-selected text-foreground"
            )}
          >
            <Icon className="size-[18px]" aria-hidden="true" />
            <span className="zh-label">{label}</span><span className="en-label">{labelEn}</span>
          </Link>
        );
      })}
    </nav>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  return <RuntimeConfigProvider><ShellContent>{children}</ShellContent></RuntimeConfigProvider>;
}

function ShellContent({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { locale } = useLocale();
  const runtime = useRuntimeConfig();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuTriggerRef = useRef<HTMLButtonElement>(null);
  const menuPanelRef = useRef<HTMLElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;

    const previousOverflow = document.body.style.overflow;
    const menuTrigger = menuTriggerRef.current;
    const content = contentRef.current;
    document.body.style.overflow = "hidden";
    content?.setAttribute("inert", "");
    menuPanelRef.current?.querySelector<HTMLElement>("button")?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setMenuOpen(false);
      } else if (event.key === "Tab") {
        const focusable = Array.from(menuPanelRef.current?.querySelectorAll<HTMLElement>("a, button") ?? []);
        if (!focusable.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      content?.removeAttribute("inert");
      document.removeEventListener("keydown", onKeyDown);
      menuTrigger?.focus();
    };
  }, [menuOpen]);

  return (
    <div className="min-h-screen bg-background">
      <a href="#main-content" className="fixed left-4 top-3 z-[100] -translate-y-20 rounded-md bg-focus px-4 py-2 text-sm font-semibold text-background transition focus:translate-y-0">Skip to content</a>
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[216px] border-r border-border bg-sidebar px-4 py-5 lg:flex lg:flex-col">
        <Link href="/dashboard" className="flex items-center gap-3 rounded-md px-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus">
          <Image src="/brand-mark.svg" alt="" width={34} height={34} priority className="size-8 rounded-md" />
          <span className="text-xl font-semibold tracking-tight">Vesti</span>
        </Link>
        <p className="mt-7 px-3 text-xs font-medium text-muted-foreground"><span className="zh-label">工作空间</span><span className="en-label">Workspace</span></p>
        <Navigation pathname={pathname} />
        <Link
          href="/contracts/new"
          className="mt-6 inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
        >
          <Plus className="size-4" aria-hidden="true" /> <span className="zh-label">新建合约</span><span className="en-label">New contract</span>
        </Link>
        <div className="mt-auto border-t border-border pt-4 text-xs leading-5 text-muted-foreground">
          {runtime ? runtime.escrowMode === "mock" ? (locale === "zh" ? "模拟托管" : "Mock escrow") : `Solana ${runtime.network}` : (locale === "zh" ? "正在读取运行环境" : "Loading environment")}
        </div>
      </aside>

      <div ref={contentRef} className="lg:pl-[216px]">
        <header className="sticky top-0 z-30 flex min-h-14 items-center border-b border-border bg-background/92 px-4 backdrop-blur md:px-6">
          <button
            ref={menuTriggerRef}
            type="button"
            className="mr-3 inline-flex size-11 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground lg:hidden"
            onClick={() => setMenuOpen(true)}
            aria-label="Open navigation"
          >
            <Menu className="size-5" />
          </button>
          <p className="hidden text-sm text-muted-foreground sm:block"><span className="zh-label">工作空间</span><span className="en-label">Workspace</span> <span className="mx-2">/</span> Vesti</p>
          <div className="ml-auto flex min-w-0 items-center gap-2">
            <span className="max-w-24 truncate rounded border border-border px-1.5 py-1 text-[11px] text-muted-foreground sm:max-w-none sm:px-2 sm:text-xs">{runtime ? runtime.escrowMode === "mock" ? (locale === "zh" ? "模拟托管" : "Mock escrow") : `Solana ${runtime.network}` : "…"}</span>
            <LanguageToggle />
            <WalletBar />
          </div>
        </header>
        <main id="main-content" tabIndex={-1} className="min-w-0">{children}</main>
      </div>

      {menuOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button className="absolute inset-0 bg-black/60" aria-hidden="true" tabIndex={-1} onClick={() => setMenuOpen(false)} />
          <aside ref={menuPanelRef} role="dialog" aria-modal="true" aria-label="Navigation" className="absolute inset-y-0 left-0 w-[min(19rem,86vw)] border-r border-border bg-sidebar p-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <Link href="/dashboard" className="flex items-center gap-3" onClick={() => setMenuOpen(false)}>
                <Image src="/brand-mark.svg" alt="" width={34} height={34} className="size-8 rounded-md" />
                <span className="text-xl font-semibold">Vesti</span>
              </Link>
              <button type="button" className="inline-flex size-11 items-center justify-center rounded-md" onClick={() => setMenuOpen(false)} aria-label="Close navigation">
                <X className="size-5" />
              </button>
            </div>
            <Navigation pathname={pathname} onNavigate={() => setMenuOpen(false)} />
          </aside>
        </div>
      ) : null}
    </div>
  );
}
