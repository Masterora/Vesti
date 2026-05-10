import { defaultLocale, supportedLocales, type Locale } from "./messages";

export const localeCookieName = "vesti.locale";
export const localeHeaderName = "x-vesti-locale";

export function normalizeLocale(value?: null | string): Locale {
  return supportedLocales.includes(value as Locale) ? (value as Locale) : defaultLocale;
}

export function resolveLocaleFromCookieHeader(cookieHeader?: null | string) {
  if (!cookieHeader) {
    return defaultLocale;
  }

  const matched = cookieHeader
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${localeCookieName}=`));

  return normalizeLocale(matched?.split("=")[1]);
}

export function getRequestLocale(request: Request) {
  return normalizeLocale(
    request.headers.get(localeHeaderName) ?? resolveLocaleFromCookieHeader(request.headers.get("cookie"))
  );
}

export function getIntlLocale(locale: Locale) {
  return locale === "zh" ? "zh-CN" : "en-US";
}
