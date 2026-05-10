"use client";

import { Button } from "@/components/ui/button";
import { useLocale } from "./locale-provider";

export function LanguageToggle() {
  const { locale, messages, setLocale } = useLocale();

  return (
    <div className="flex items-center gap-1 rounded-md border border-border bg-white p-1">
      <Button
        type="button"
        variant={locale === "en" ? "primary" : "ghost"}
        className="h-8 px-3"
        onClick={() => setLocale("en")}
      >
        {messages.language.english}
      </Button>
      <Button
        type="button"
        variant={locale === "zh" ? "primary" : "ghost"}
        className="h-8 px-3"
        onClick={() => setLocale("zh")}
      >
        {messages.language.chinese}
      </Button>
    </div>
  );
}
