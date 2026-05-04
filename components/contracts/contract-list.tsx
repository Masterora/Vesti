"use client";

import Link from "next/link";
import { FileText } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { ContractProgress } from "@/components/contracts/contract-progress";
import { shortenWallet } from "@/lib/utils";
import type { SerializedContract } from "@/types/contract";

export function ContractList({
  contracts,
  walletAddress
}: {
  contracts: SerializedContract[];
  walletAddress: string;
}) {
  if (contracts.length === 0) {
    return (
      <Card className="flex min-h-64 items-center justify-center text-center">
        <div>
          <FileText className="mx-auto size-10 text-muted-foreground" aria-hidden="true" />
          <h2 className="mt-4 text-xl font-semibold">No contracts yet</h2>
          <p className="mt-2 max-w-md text-sm text-muted-foreground">
            Create a contract as Creator, then switch to the Worker wallet to submit proof.
          </p>
        </div>
      </Card>
    );
  }

  return (
    <div className="grid gap-4">
      {contracts.map((contract) => {
        const role = walletAddress === contract.creatorWallet ? "Creator" : "Worker";

        return (
          <Link key={contract.id} href={`/contracts/detail?id=${contract.id}`}>
            <Card className="transition hover:-translate-y-0.5 hover:border-primary/40">
              <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-xl font-semibold">{contract.title}</h2>
                    <Badge value={contract.status} />
                    <span className="rounded-md bg-muted px-2 py-1 text-xs font-semibold text-muted-foreground">
                      {role}
                    </span>
                  </div>
                  <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">
                    {contract.description || "No description"}
                  </p>
                  <div className="mt-4 flex flex-wrap gap-3 text-xs text-muted-foreground">
                    <span>Creator {shortenWallet(contract.creatorWallet)}</span>
                    <span>Worker {shortenWallet(contract.workerWallet)}</span>
                    <span>{contract.milestones.length} milestones</span>
                  </div>
                </div>
                <div className="w-full lg:w-80">
                  <ContractProgress
                    totalAmount={contract.totalAmount}
                    fundedAmount={contract.fundedAmount}
                    releasedAmount={contract.releasedAmount}
                  />
                </div>
              </div>
            </Card>
          </Link>
        );
      })}
    </div>
  );
}
