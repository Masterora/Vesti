export const siteName = "Vesti";
export const siteTagline = "Milestone escrow for remote teams";
export const siteDescription = "USDC milestone escrow for remote work collaboration.";
export const siteKeywords = [
  "Vesti",
  "Solana escrow",
  "USDC milestones",
  "remote work contracts",
  "milestone payments"
];

function normalizeSiteUrl(rawUrl: string) {
  const trimmedUrl = rawUrl.trim();

  if (trimmedUrl.startsWith("http://") || trimmedUrl.startsWith("https://")) {
    return trimmedUrl;
  }

  return `https://${trimmedUrl}`;
}

export function getSiteUrl() {
  const siteUrl =
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.VERCEL_PROJECT_PRODUCTION_URL ||
    process.env.VERCEL_URL ||
    "http://localhost:3000";

  return new URL(normalizeSiteUrl(siteUrl));
}

export function getAbsoluteUrl(path = "/") {
  return new URL(path, getSiteUrl()).toString();
}
