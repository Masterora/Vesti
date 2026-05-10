"use client";

import { useLocale } from "./locale-provider";

export function LanguageToggle() {
  const { locale, setLocale } = useLocale();

  return (
    <div className="rounded-md border border-border bg-white px-2">
      <label htmlFor="language-select" className="sr-only">
        Language
      </label>
      <select
        id="language-select"
        aria-label="Language"
        className="h-8 bg-transparent pr-6 text-sm outline-none"
        value={locale}
        onChange={(event) => setLocale(event.target.value as "en" | "zh")}
      >
        <option value="en">English</option>
        <option value="zh">Chinese</option>
      </select>
    </div>
  );
}
