import { db } from "@/lib/db";
import { ServiceError } from "@/lib/services/errors";
import type { SerializedPublicUserProfile, SerializedSessionUserProfile } from "@/types/profile";

export function serializePublicUserProfile(profile: {
  walletAddress: string;
  displayName: string | null;
}): SerializedPublicUserProfile {
  return {
    walletAddress: profile.walletAddress,
    displayName: profile.displayName?.trim() || null
  };
}

export function serializeSessionUserProfile(profile: {
  walletAddress: string;
  displayName: string | null;
  email: string | null;
  bio: string | null;
}): SerializedSessionUserProfile {
  return {
    walletAddress: profile.walletAddress,
    displayName: profile.displayName?.trim() || null,
    email: profile.email?.trim() || null,
    bio: profile.bio?.trim() || null
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
      displayName: true
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
      bio: true
    }
  });

  return user ? serializeSessionUserProfile(user) : null;
}

export async function updateSessionUserProfile(input: {
  walletAddress: string;
  displayName?: string;
  email?: string;
  bio?: string;
}) {
  const email = input.email?.trim().toLowerCase() || null;

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
      bio: input.bio?.trim() || null
    },
    create: {
      walletAddress: input.walletAddress,
      displayName: input.displayName?.trim() || null,
      email,
      bio: input.bio?.trim() || null
    },
    select: {
      walletAddress: true,
      displayName: true,
      email: true,
      bio: true
    }
  });

  return serializeSessionUserProfile(updated);
}
