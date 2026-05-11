export const contractStatuses = [
  "open",
  "claimed",
  "draft",
  "active",
  "completed",
  "cancelled",
  "disputed"
] as const;

export type ContractStatus = (typeof contractStatuses)[number];
