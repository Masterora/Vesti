export const contractStatuses = [
  "draft",
  "active",
  "completed",
  "cancelled",
  "disputed"
] as const;

export type ContractStatus = (typeof contractStatuses)[number];
