export type SerializedPublicUserProfile = {
  walletAddress: string;
  displayName: string | null;
};

export type SerializedSessionUserProfile = SerializedPublicUserProfile & {
  email: string | null;
  bio: string | null;
  completedContractsCount: number;
  joinedAt: string;
};
