import { shortenWallet } from "@/lib/utils";
import type { SerializedPublicUserProfile } from "@/types/profile";

export function findProfile(
  profiles: SerializedPublicUserProfile[] | undefined,
  walletAddress: string | null | undefined
) {
  if (!profiles || !walletAddress) {
    return null;
  }

  return profiles.find((profile) => profile.walletAddress === walletAddress) ?? null;
}

export function getWalletDisplayName(
  profiles: SerializedPublicUserProfile[] | undefined,
  walletAddress: string | null | undefined
) {
  return findProfile(profiles, walletAddress)?.displayName?.trim() || null;
}

export function getWalletDisplayLabel(
  profiles: SerializedPublicUserProfile[] | undefined,
  walletAddress: string | null | undefined
) {
  if (!walletAddress) {
    return "";
  }

  return getWalletDisplayName(profiles, walletAddress) ?? shortenWallet(walletAddress);
}
