import { ContractDetailClient } from "@/components/contracts/contract-detail-client";

export default async function ContractDetailPage({
  searchParams
}: {
  searchParams: Promise<{ id?: string }>;
}) {
  const params = await searchParams;

  return <ContractDetailClient contractId={params.id ?? ""} />;
}
