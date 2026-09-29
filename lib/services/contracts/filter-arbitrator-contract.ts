import { serializeContractWithProfiles } from "@/lib/services/serialize";

type SerializedContract = Awaited<ReturnType<typeof serializeContractWithProfiles>>;

export function filterArbitratorContract(contract: SerializedContract) {
  return {
    ...contract,
    requestedWorkerWallet: null,
    comments: undefined,
    applications: undefined,
    escrowTransactions: undefined,
    events: undefined,
    profiles: contract.profiles?.filter(
      (profile) => profile.walletAddress === contract.creatorWallet || profile.walletAddress === contract.workerWallet
    )
  };
}

export async function serializeArbitratorContract(
  contract: Parameters<typeof serializeContractWithProfiles>[0]
) {
  return filterArbitratorContract(await serializeContractWithProfiles(contract));
}
