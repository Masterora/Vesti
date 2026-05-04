"use client";

import Link from "next/link";
import { Check, CircleDollarSign, ExternalLink, RefreshCw, Send, Wallet } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Label, Textarea } from "@/components/ui/input";
import { ContractProgress } from "@/components/contracts/contract-progress";
import { EventTimeline } from "@/components/timeline/event-timeline";
import { useWallet } from "@/components/wallet/wallet-provider";
import { postJson } from "@/lib/api/client";
import { formatDate, formatUsdc, shortenWallet } from "@/lib/utils";
import type { SerializedContract, SerializedMilestone } from "@/types/contract";

type ContractDetailClientProps = {
  contractId: string;
};

type ProofDraft = {
  note: string;
  proofUrl: string;
};

export function ContractDetailClient({ contractId }: ContractDetailClientProps) {
  const { walletAddress } = useWallet();
  const [contract, setContract] = useState<SerializedContract | null>(null);
  const [proofDrafts, setProofDrafts] = useState<Record<string, ProofDraft>>({});
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(Boolean(contractId));
  const [activeAction, setActiveAction] = useState("");

  const role = useMemo(() => {
    if (!contract) {
      return "viewer";
    }

    if (walletAddress === contract.creatorWallet) {
      return "creator";
    }

    if (walletAddress === contract.workerWallet) {
      return "worker";
    }

    return "viewer";
  }, [contract, walletAddress]);

  const loadContract = useCallback(async () => {
    if (!contractId) {
      return;
    }

    setIsLoading(true);
    setError("");

    try {
      const data = await postJson<SerializedContract>("/api/contracts/get", {
        contractId,
        walletAddress
      });
      setContract(data);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Failed to load contract");
    } finally {
      setIsLoading(false);
    }
  }, [contractId, walletAddress]);

  useEffect(() => {
    void loadContract();
  }, [loadContract]);

  const runAction = async (actionKey: string, url: string, body: unknown) => {
    setActiveAction(actionKey);
    setError("");

    try {
      const data = await postJson<SerializedContract>(url, body);
      setContract(data);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Action failed");
    } finally {
      setActiveAction("");
    }
  };

  const submitProof = async (milestone: SerializedMilestone) => {
    const draft = proofDrafts[milestone.id] ?? {
      note: "",
      proofUrl: ""
    };

    await runAction(`submit-${milestone.id}`, "/api/milestones/submit-proof", {
      contractId,
      milestoneId: milestone.id,
      walletAddress,
      note: draft.note,
      proofUrl: draft.proofUrl || undefined
    });
  };

  const updateDraft = (milestoneId: string, patch: Partial<ProofDraft>) => {
    setProofDrafts((current) => ({
      ...current,
      [milestoneId]: {
        note: current[milestoneId]?.note ?? "",
        proofUrl: current[milestoneId]?.proofUrl ?? "",
        ...patch
      }
    }));
  };

  if (!contractId) {
    return (
      <div className="page-shell py-10">
        <Card>
          <h1 className="text-xl font-semibold">Contract id is required</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Open a contract from the dashboard or use `/contracts/detail?id=...`.
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div className="page-shell py-10">
      <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-primary">Contract detail</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight md:text-4xl">
            {contract?.title ?? "Loading contract"}
          </h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="secondary" onClick={loadContract} disabled={isLoading}>
            <RefreshCw className="mr-2 size-4" aria-hidden="true" />
            Refresh
          </Button>
          <Link href="/dashboard">
            <Button type="button" variant="secondary">
              Dashboard
            </Button>
          </Link>
        </div>
      </div>

      {error ? <p className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}

      {isLoading || !contract ? (
        <Card>Loading contract...</Card>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
          <div className="space-y-6">
            <Card>
              <div className="flex flex-wrap items-center gap-2">
                <Badge value={contract.status} />
                <span className="rounded-md bg-muted px-2 py-1 text-xs font-semibold text-muted-foreground">
                  {role}
                </span>
              </div>
              <p className="mt-4 text-sm leading-6 text-muted-foreground">
                {contract.description || "No description"}
              </p>
              <div className="mt-5 grid gap-3 text-sm md:grid-cols-2">
                <WalletLine label="Creator" wallet={contract.creatorWallet} />
                <WalletLine label="Worker" wallet={contract.workerWallet} />
                <WalletLine label="Escrow" wallet={contract.escrowAccount || "Not funded"} />
              </div>
              <div className="mt-6">
                <ContractProgress
                  totalAmount={contract.totalAmount}
                  fundedAmount={contract.fundedAmount}
                  releasedAmount={contract.releasedAmount}
                />
              </div>
              {role === "creator" && contract.status === "draft" ? (
                <div className="mt-6">
                  <Button
                    type="button"
                    onClick={() =>
                      runAction("fund", "/api/contracts/fund", {
                        contractId: contract.id,
                        walletAddress
                      })
                    }
                    disabled={activeAction === "fund"}
                  >
                    <CircleDollarSign className="mr-2 size-4" aria-hidden="true" />
                    {activeAction === "fund" ? "Funding..." : "Fund contract"}
                  </Button>
                </div>
              ) : null}
            </Card>

            <section className="space-y-4">
              <h2 className="text-xl font-semibold">Milestones</h2>
              {contract.milestones.map((milestone) => (
                <Card key={milestone.id}>
                  <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-lg font-semibold">
                          {milestone.index}. {milestone.title}
                        </h3>
                        <Badge value={milestone.status} />
                      </div>
                      <p className="mt-2 text-sm leading-6 text-muted-foreground">
                        {milestone.description || "No description"}
                      </p>
                    </div>
                    <div className="shrink-0 text-left md:text-right">
                      <p className="font-semibold">{formatUsdc(milestone.amount)}</p>
                      <p className="text-xs text-muted-foreground">{formatDate(milestone.dueAt)}</p>
                    </div>
                  </div>

                  <ProofHistory milestone={milestone} />

                  <MilestoneActions
                    milestone={milestone}
                    role={role}
                    activeAction={activeAction}
                    draft={proofDrafts[milestone.id] ?? { note: "", proofUrl: "" }}
                    onDraftChange={(patch) => updateDraft(milestone.id, patch)}
                    onSubmitProof={() => submitProof(milestone)}
                    onApprove={() =>
                      runAction(`approve-${milestone.id}`, "/api/milestones/approve", {
                        contractId: contract.id,
                        milestoneId: milestone.id,
                        walletAddress
                      })
                    }
                    onRelease={() =>
                      runAction(`release-${milestone.id}`, "/api/milestones/release", {
                        contractId: contract.id,
                        milestoneId: milestone.id,
                        walletAddress
                      })
                    }
                  />
                </Card>
              ))}
            </section>
          </div>

          <aside className="space-y-6 lg:sticky lg:top-24 lg:h-max">
            <Card>
              <h2 className="mb-4 text-lg font-semibold">Timeline</h2>
              <EventTimeline events={contract.events} />
            </Card>
          </aside>
        </div>
      )}
    </div>
  );
}

function WalletLine({ label, wallet }: { label: string; wallet: string }) {
  return (
    <div className="flex min-w-0 items-center gap-2 rounded-lg bg-muted p-3">
      <Wallet className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      <div className="min-w-0">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="truncate font-medium" title={wallet}>
          {shortenWallet(wallet)}
        </p>
      </div>
    </div>
  );
}

function ProofHistory({ milestone }: { milestone: SerializedMilestone }) {
  const proofs = milestone.proofSubmissions ?? [];

  if (proofs.length === 0) {
    return <p className="mt-4 text-sm text-muted-foreground">No proof submitted yet.</p>;
  }

  return (
    <div className="mt-4 rounded-lg border border-border">
      {proofs.map((proof) => (
        <div key={proof.id} className="border-b border-border p-3 last:border-b-0">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold">Proof v{proof.version}</p>
            <p className="text-xs text-muted-foreground">{new Date(proof.createdAt).toLocaleString()}</p>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">{proof.note}</p>
          {proof.proofUrl ? (
            <a
              href={proof.proofUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-2 inline-flex items-center text-sm font-semibold text-primary"
            >
              Open proof
              <ExternalLink className="ml-1 size-3" aria-hidden="true" />
            </a>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function MilestoneActions({
  milestone,
  role,
  activeAction,
  draft,
  onDraftChange,
  onSubmitProof,
  onApprove,
  onRelease
}: {
  milestone: SerializedMilestone;
  role: string;
  activeAction: string;
  draft: ProofDraft;
  onDraftChange: (patch: Partial<ProofDraft>) => void;
  onSubmitProof: () => void;
  onApprove: () => void;
  onRelease: () => void;
}) {
  if (role === "worker" && ["ready", "revision_requested"].includes(milestone.status)) {
    return (
      <div className="mt-5 rounded-lg bg-muted p-4">
        <div className="grid gap-3">
          <div className="grid gap-2">
            <Label>Proof note</Label>
            <Textarea
              value={draft.note}
              onChange={(event) => onDraftChange({ note: event.target.value })}
              placeholder="Summarize what was delivered."
            />
          </div>
          <div className="grid gap-2">
            <Label>Proof URL</Label>
            <Input
              value={draft.proofUrl}
              onChange={(event) => onDraftChange({ proofUrl: event.target.value })}
              placeholder="https://..."
            />
          </div>
          <Button
            type="button"
            className="w-max"
            onClick={onSubmitProof}
            disabled={!draft.note || activeAction === `submit-${milestone.id}`}
          >
            <Send className="mr-2 size-4" aria-hidden="true" />
            {activeAction === `submit-${milestone.id}` ? "Submitting..." : "Submit proof"}
          </Button>
        </div>
      </div>
    );
  }

  if (role === "creator" && milestone.status === "submitted") {
    return (
      <div className="mt-5">
        <Button
          type="button"
          onClick={onApprove}
          disabled={activeAction === `approve-${milestone.id}`}
        >
          <Check className="mr-2 size-4" aria-hidden="true" />
          {activeAction === `approve-${milestone.id}` ? "Approving..." : "Approve milestone"}
        </Button>
      </div>
    );
  }

  if (role === "creator" && milestone.status === "approved") {
    return (
      <div className="mt-5">
        <Button
          type="button"
          onClick={onRelease}
          disabled={activeAction === `release-${milestone.id}`}
        >
          <CircleDollarSign className="mr-2 size-4" aria-hidden="true" />
          {activeAction === `release-${milestone.id}` ? "Releasing..." : "Release payment"}
        </Button>
      </div>
    );
  }

  return null;
}
