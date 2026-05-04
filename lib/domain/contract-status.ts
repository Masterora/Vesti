export const contractStatuses = [
  "draft",
  "funded",
  "active",
  "completed",
  "cancelled",
  "disputed"
] as const;

export type ContractStatus = (typeof contractStatuses)[number];
