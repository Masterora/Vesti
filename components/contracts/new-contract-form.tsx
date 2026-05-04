"use client";

import { Plus, Trash2 } from "lucide-react";
import type { FormEvent } from "react";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Label, Textarea } from "@/components/ui/input";
import { useWallet } from "@/components/wallet/wallet-provider";
import { postJson } from "@/lib/api/client";
import { formatUsdc } from "@/lib/utils";
import type { SerializedContract } from "@/types/contract";

type MilestoneDraft = {
  title: string;
  description: string;
  amount: string;
  dueAt: string;
};

const initialMilestones: MilestoneDraft[] = [
  {
    title: "Discovery and specification",
    description: "Confirm scope and deliver implementation plan.",
    amount: "250",
    dueAt: ""
  },
  {
    title: "MVP delivery",
    description: "Deliver working MVP and proof package.",
    amount: "750",
    dueAt: ""
  }
];

export function NewContractForm() {
  const router = useRouter();
  const { walletAddress, defaultWallets } = useWallet();
  const [title, setTitle] = useState("Vesti MVP build");
  const [description, setDescription] = useState(
    "Build a working milestone escrow MVP with dashboard, proof submission, approval, and release flow."
  );
  const [workerWallet, setWorkerWallet] = useState(defaultWallets.worker);
  const [totalAmount, setTotalAmount] = useState("1000");
  const [milestones, setMilestones] = useState(initialMilestones);
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const milestoneTotal = useMemo(
    () => milestones.reduce((sum, milestone) => sum + Number(milestone.amount || 0), 0),
    [milestones]
  );
  const totalMatches = Number(totalAmount || 0) === milestoneTotal;

  const updateMilestone = (index: number, patch: Partial<MilestoneDraft>) => {
    setMilestones((current) =>
      current.map((milestone, currentIndex) =>
        currentIndex === index ? { ...milestone, ...patch } : milestone
      )
    );
  };

  const addMilestone = () => {
    setMilestones((current) => [
      ...current,
      {
        title: "",
        description: "",
        amount: "",
        dueAt: ""
      }
    ]);
  };

  const removeMilestone = (index: number) => {
    setMilestones((current) => current.filter((_, currentIndex) => currentIndex !== index));
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);

    try {
      const contract = await postJson<SerializedContract>("/api/contracts/create", {
        creatorWallet: walletAddress,
        workerWallet,
        title,
        description,
        totalAmount,
        milestones: milestones.map((milestone) => ({
          ...milestone,
          description: milestone.description || undefined,
          dueAt: milestone.dueAt || undefined
        }))
      });

      router.push(`/contracts/detail?id=${contract.id}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Failed to create contract");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form className="grid gap-6 lg:grid-cols-[1fr_360px]" onSubmit={submit}>
      <div className="space-y-5">
        <Card>
          <h2 className="text-lg font-semibold">Contract</h2>
          <div className="mt-5 grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="title">Title</Label>
              <Input id="title" value={title} onChange={(event) => setTitle(event.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
              />
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="creator">Creator wallet</Label>
                <Input id="creator" value={walletAddress} readOnly />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="worker">Worker wallet</Label>
                <Input
                  id="worker"
                  value={workerWallet}
                  onChange={(event) => setWorkerWallet(event.target.value)}
                />
              </div>
            </div>
          </div>
        </Card>

        <Card>
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">Milestones</h2>
            <Button type="button" variant="secondary" onClick={addMilestone}>
              <Plus className="mr-2 size-4" aria-hidden="true" />
              Add
            </Button>
          </div>
          <div className="mt-5 space-y-4">
            {milestones.map((milestone, index) => (
              <div key={index} className="rounded-lg border border-border p-4">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <h3 className="font-semibold">Milestone {index + 1}</h3>
                  {milestones.length > 1 ? (
                    <Button
                      type="button"
                      variant="ghost"
                      className="size-9 px-0"
                      onClick={() => removeMilestone(index)}
                      title="Remove milestone"
                    >
                      <Trash2 className="size-4" aria-hidden="true" />
                    </Button>
                  ) : null}
                </div>
                <div className="grid gap-4">
                  <div className="grid gap-2">
                    <Label>Title</Label>
                    <Input
                      value={milestone.title}
                      onChange={(event) => updateMilestone(index, { title: event.target.value })}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label>Description</Label>
                    <Textarea
                      value={milestone.description}
                      onChange={(event) =>
                        updateMilestone(index, { description: event.target.value })
                      }
                    />
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="grid gap-2">
                      <Label>Amount</Label>
                      <Input
                        inputMode="decimal"
                        value={milestone.amount}
                        onChange={(event) => updateMilestone(index, { amount: event.target.value })}
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label>Due date</Label>
                      <Input
                        type="date"
                        value={milestone.dueAt}
                        onChange={(event) => updateMilestone(index, { dueAt: event.target.value })}
                      />
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <aside className="lg:sticky lg:top-24 lg:h-max">
        <Card>
          <h2 className="text-lg font-semibold">Funding summary</h2>
          <div className="mt-5 space-y-4">
            <div className="grid gap-2">
              <Label htmlFor="totalAmount">Contract total</Label>
              <Input
                id="totalAmount"
                inputMode="decimal"
                value={totalAmount}
                onChange={(event) => setTotalAmount(event.target.value)}
              />
            </div>
            <div className="rounded-lg bg-muted p-4">
              <div className="flex justify-between gap-3 text-sm">
                <span className="text-muted-foreground">Milestone total</span>
                <span className="font-semibold">{formatUsdc(milestoneTotal)}</span>
              </div>
              <div className="mt-2 flex justify-between gap-3 text-sm">
                <span className="text-muted-foreground">Contract total</span>
                <span className="font-semibold">{formatUsdc(totalAmount)}</span>
              </div>
            </div>
            {!totalMatches ? (
              <p className="rounded-md bg-amber-50 p-3 text-sm text-amber-800">
                Milestone amounts must equal the contract total.
              </p>
            ) : null}
            {error ? <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
            <Button type="submit" className="w-full" disabled={!totalMatches || isSubmitting}>
              {isSubmitting ? "Creating..." : "Create contract"}
            </Button>
          </div>
        </Card>
      </aside>
    </form>
  );
}
