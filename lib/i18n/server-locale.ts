import { cookies } from "next/headers";
import { normalizeLocale } from "./locale";

export async function getServerLocale() {
  const cookieStore = await cookies();
  return normalizeLocale(cookieStore.get("vesti.locale")?.value);
}
