export const eventTypes = [
  "contract_created",
  "contract_claim_requested",
  "contract_claim_accepted",
  "contract_funded",
  "contract_activated",
  "milestone_ready",
  "milestone_proof_submitted",
  "milestone_revision_requested",
  "milestone_approved",
  "milestone_released",
  "contract_completed",
  "contract_cancelled",
  "contract_disputed",
  "dispute_resolution_proposed",
  "contract_dispute_resolved",
  "contract_refunded"
] as const;

export type EventType = (typeof eventTypes)[number];
