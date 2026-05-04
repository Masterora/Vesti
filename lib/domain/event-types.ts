export const eventTypes = [
  "contract_created",
  "contract_funded",
  "contract_activated",
  "milestone_ready",
  "milestone_proof_submitted",
  "milestone_approved",
  "milestone_released",
  "contract_completed",
  "contract_cancelled",
  "contract_disputed"
] as const;

export type EventType = (typeof eventTypes)[number];
