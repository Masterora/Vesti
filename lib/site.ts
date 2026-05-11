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

export function getSiteUrl() {
  return new URL(process.env.NEXT_PUBLIC_APP_URL!);
}

export function getAbsoluteUrl(path = "/") {
  return new URL(path, getSiteUrl()).toString();
}