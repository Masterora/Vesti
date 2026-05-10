import { translateErrorMessage } from "@/lib/i18n/error-messages";

export async function postJson<T>(url: string, body: unknown): Promise<T> {
  const locale =
    typeof document !== "undefined" && document.documentElement.lang.toLowerCase().startsWith("zh")
      ? "zh"
      : "en";

  const response = await fetch(url, {
    method: "POST",
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
      "x-vesti-locale": locale
    },
    body: JSON.stringify(body)
  });

  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload.error ?? translateErrorMessage(locale, "Request failed"));
  }

  return payload.data as T;
}
