export const milestoneStatuses = [
  "pending",
  "ready",
  "submitted",
  "revision_requested",
  "approved",
  "released",
  "disputed"
] as const;

export type MilestoneStatus = (typeof milestoneStatuses)[number];
