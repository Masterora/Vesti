type ApplicantWalletRecord = {
  applicantWallet: string;
};

type PendingApplicantsSource = {
  requestedWorkerWallet?: string | null;
  applications?: ApplicantWalletRecord[] | null;
};

export function getPendingApplicantWallets(contract: PendingApplicantsSource) {
  const wallets = [
    ...(contract.applications?.map((application) => application.applicantWallet) ?? []),
    ...(contract.requestedWorkerWallet ? [contract.requestedWorkerWallet] : [])
  ];

  return Array.from(new Set(wallets.filter(Boolean)));
}

export function hasPendingApplicantWallet(contract: PendingApplicantsSource, walletAddress?: string | null) {
  const wallet = walletAddress?.trim();

  if (!wallet) {
    return false;
  }

  return getPendingApplicantWallets(contract).includes(wallet);
}
