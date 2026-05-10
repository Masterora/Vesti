"use client";

import { Check, ChevronDown } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocale } from "./locale-provider";

export function LanguageToggle() {
  const { locale, setLocale } = useLocale();
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const options = useMemo(
    () => [
      { value: "en" as const, label: "English" },
      { value: "zh" as const, label: "Chinese" }
    ],
    []
  );

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
    };
  }, []);

  const activeOption = options.find((option) => option.value === locale) ?? options[0];
  const selectLocale = useCallback(
    (nextLocale: "en" | "zh") => {
      setLocale(nextLocale);
      setIsOpen(false);
    },
    [setLocale]
  );

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-label="Language"
        className="flex h-8 items-center gap-2 rounded-md border border-border bg-white px-3 text-sm text-foreground shadow-sm transition hover:border-foreground/20"
        onClick={() => setIsOpen((current) => !current)}
      >
        <span className="text-muted-foreground">Language</span>
        <span>{activeOption.label}</span>
        <ChevronDown className="size-4 text-muted-foreground" aria-hidden="true" />
      </button>
      {isOpen ? (
        <div
          role="menu"
          aria-label="Language"
          className="absolute right-0 top-full z-50 mt-2 min-w-40 rounded-md border border-border bg-white p-1 shadow-lg"
        >
          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              role="menuitemradio"
              aria-checked={locale === option.value}
              className="flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm transition hover:bg-muted"
              onClick={() => selectLocale(option.value)}
            >
              <span>{option.label}</span>
              {locale === option.value ? (
                <Check className="size-4 text-primary" aria-hidden="true" />
              ) : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
