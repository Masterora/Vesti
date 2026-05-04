import type { EventType, Prisma } from "@prisma/client";

type RecordEventInput = {
  contractId: string;
  milestoneId?: string | null;
  actorWallet: string;
  eventType: EventType;
  payload?: Prisma.InputJsonValue;
  txSig?: string | null;
};

export async function recordEvent(tx: Prisma.TransactionClient, input: RecordEventInput) {
  return tx.event.create({
    data: {
      contractId: input.contractId,
      milestoneId: input.milestoneId,
      actorWallet: input.actorWallet,
      eventType: input.eventType,
      payload: input.payload ?? undefined,
      txSig: input.txSig
    }
  });
}
