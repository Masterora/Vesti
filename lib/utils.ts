import { clsx, type ClassValue } from "clsx";
import { getIntlLocale } from "@/lib/i18n/locale";
import type { Locale } from "@/lib/i18n/messages";

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}

export function formatUsdc(value: string | number, locale: Locale = "en") {
  const amount = Number(value);
  const formatted = new Intl.NumberFormat(getIntlLocale(locale), {
    minimumFractionDigits: 2,
    maximumFractionDigits: 6
  }).format(Number.isFinite(amount) ? amount : 0);

  return `$${formatted}`;
}

export function shortenWallet(wallet: string) {
  if (wallet.length <= 12) {
    return wallet;
  }

  return `${wallet.slice(0, 6)}...${wallet.slice(-6)}`;
}

function pad2(value: number) {
  return String(value).padStart(2, "0");
}

function toDateParts(value: string | Date) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return {
    year: date.getFullYear(),
    month: date.getMonth() + 1,
    day: date.getDate(),
    hour: date.getHours(),
    minute: date.getMinutes(),
    second: date.getSeconds()
  };
}

export function formatDate(value?: string | Date | null, locale: Locale = "en", emptyLabel?: string) {
  if (!value) {
    return emptyLabel ?? (locale === "zh" ? "无截止日期" : "No due date");
  }

  const parts = toDateParts(value);

  if (!parts) {
    return emptyLabel ?? "";
  }

  if (locale === "zh") {
    return `${parts.year}年${parts.month}月${parts.day}日`;
  }

  return `${parts.year}-${pad2(parts.month)}-${pad2(parts.day)}`;
}

export function formatDateTime(value: string | Date, locale: Locale = "en") {
  const parts = toDateParts(value);

  if (!parts) {
    return "";
  }

  const time = `${pad2(parts.hour)}:${pad2(parts.minute)}:${pad2(parts.second)}`;

  if (locale === "zh") {
    return `${parts.year}年${parts.month}月${parts.day}日 ${time}`;
  }

  return `${parts.year}-${pad2(parts.month)}-${pad2(parts.day)} ${time}`;
}
