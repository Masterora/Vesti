export type ContractRole = "creator" | "worker" | "viewer";

export function getContractRole(input: {
  walletAddress?: string | null;
  creatorWallet: string;
  workerWallet: string;
}): ContractRole {
  const wallet = input.walletAddress?.trim();

  if (!wallet) {
    return "viewer";
  }

  if (wallet === input.creatorWallet) {
    return "creator";
  }

  if (wallet === input.workerWallet) {
    return "worker";
  }

  return "viewer";
}

export function requireWallet(walletAddress: string) {
  const wallet = walletAddress.trim();

  if (!wallet) {
    throw new Error("Wallet address is required");
  }

  return wallet;
}
