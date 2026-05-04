export type TimelineEvent = {
  id: string;
  eventType: string;
  actorWallet: string;
  txSig: string | null;
  createdAt: string;
};
