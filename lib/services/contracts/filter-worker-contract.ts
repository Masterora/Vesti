import { serializeContractWithProfiles } from "@/lib/services/serialize";

type SerializedContract = Awaited<ReturnType<typeof serializeContractWithProfiles>>;

export function filterWorkerContract(contract: SerializedContract) {
  return {
    ...contract,
    requestedWorkerWallet: null,
    applications: undefined,
    events: contract.events?.filter((event) => event.eventType !== "contract_claim_requested"),
    profiles: contract.profiles?.filter(
      (profile) => profile.walletAddress === contract.creatorWallet || profile.walletAddress === contract.workerWallet
    )
  };
}

export async function serializeParticipantContract(
  contract: Parameters<typeof serializeContractWithProfiles>[0],
  walletAddress: string
) {
  const serialized = await serializeContractWithProfiles(contract);
  return walletAddress === contract.workerWallet ? filterWorkerContract(serialized) : serialized;
}
