import { db } from "@/lib/db";
import { buildStoredProfileAvatarUrl } from "@/lib/avatar";
import { ServiceError } from "@/lib/services/errors";
import type { SerializedPublicUserProfile, SerializedSessionUserProfile } from "@/types/profile";

export function serializePublicUserProfile(profile: {
  walletAddress: string;
  displayName: string | null;
  avatarUpdatedAt: Date | null;
}): SerializedPublicUserProfile {
  return {
    walletAddress: profile.walletAddress,
    displayName: profile.displayName?.trim() || null,
    avatarImage: profile.avatarUpdatedAt
      ? buildStoredProfileAvatarUrl(profile.walletAddress, profile.avatarUpdatedAt.toISOString())
      : null
  };
}

export function serializeSessionUserProfile(profile: {
  walletAddress: string;
  displayName: string | null;
  email: string | null;
  bio: string | null;
  avatarImage: string | null;
  createdAt: Date;
  _count: {
    createdContracts: number;
    workedContracts: number;
  };
}): SerializedSessionUserProfile {
  return {
    walletAddress: profile.walletAddress,
    displayName: profile.displayName?.trim() || null,
    avatarImage: profile.avatarImage || null,
    email: profile.email?.trim() || null,
    bio: profile.bio?.trim() || null,
    completedContractsCount: profile._count.createdContracts + profile._count.workedContracts,
    joinedAt: profile.createdAt.toISOString()
  };
}

export async function getPublicUserProfilesByWallets(walletAddresses: string[]) {
  const uniqueWallets = Array.from(new Set(walletAddresses.map((wallet) => wallet.trim()).filter(Boolean)));

  if (uniqueWallets.length === 0) {
    return new Map<string, SerializedPublicUserProfile>();
  }

  const users = await db.user.findMany({
    where: {
      walletAddress: {
        in: uniqueWallets
      }
    },
    select: {
      walletAddress: true,
      displayName: true,
      avatarUpdatedAt: true
    }
  });

  return new Map(users.map((user) => [user.walletAddress, serializePublicUserProfile(user)]));
}

export async function getSessionUserProfile(walletAddress: string) {
  const user = await db.user.findUnique({
    where: { walletAddress },
    select: {
      walletAddress: true,
      displayName: true,
      email: true,
      bio: true,
      avatarImage: true,
      createdAt: true,
      _count: {
        select: {
          createdContracts: {
            where: {
              status: "completed"
            }
          },
          workedContracts: {
            where: {
              status: "completed"
            }
          }
        }
      }
    }
  });

  return user ? serializeSessionUserProfile(user) : null;
}

export async function updateSessionUserProfile(input: {
  walletAddress: string;
  displayName?: string;
  email?: string;
  bio?: string;
  avatarImage?: string;
}) {
  const email = input.email?.trim().toLowerCase() || null;
  const avatarImage = input.avatarImage?.trim() || null;
  const avatarUpdate =
    input.avatarImage === undefined
      ? {}
      : {
          avatarImage,
          avatarUpdatedAt: avatarImage ? new Date() : null
        };

  if (email) {
    const existing = await db.user.findUnique({
      where: { email },
      select: {
        walletAddress: true
      }
    });

    if (existing && existing.walletAddress !== input.walletAddress) {
      throw new ServiceError("Email address is already in use", 409);
    }
  }

  const updated = await db.user.upsert({
    where: { walletAddress: input.walletAddress },
    update: {
      displayName: input.displayName?.trim() || null,
      email,
      bio: input.bio?.trim() || null,
      ...avatarUpdate
    },
    create: {
      walletAddress: input.walletAddress,
      displayName: input.displayName?.trim() || null,
      email,
      bio: input.bio?.trim() || null,
      avatarImage,
      avatarUpdatedAt: avatarImage ? new Date() : null
    },
    select: {
      walletAddress: true,
      displayName: true,
      email: true,
      bio: true,
      avatarImage: true,
      createdAt: true,
      _count: {
        select: {
          createdContracts: {
            where: {
              status: "completed"
            }
          },
          workedContracts: {
            where: {
              status: "completed"
            }
          }
        }
      }
    }
  });

  return serializeSessionUserProfile(updated);
}
