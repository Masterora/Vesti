"use client";

import { Plus, Trash2 } from "lucide-react";
import type { FormEvent } from "react";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { PublicKey } from "@solana/web3.js";
import { useLocale } from "@/components/i18n/locale-provider";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Label, Textarea } from "@/components/ui/input";
import { useWallet } from "@/components/wallet/wallet-provider";
import { postJson } from "@/lib/api/client";
import { amountIsPositive, safeAmountsEqual, sumAmountStrings } from "@/lib/domain/amount";
import { formatUsdc } from "@/lib/utils";
import type { SerializedContract } from "@/types/contract";

type MilestoneDraft = {
  key: string;
  title: string;
  description: string;
  amount: string;
  dueAt: string;
};

function createEmptyMilestone(): MilestoneDraft {
  return {
    key: crypto.randomUUID(),
    title: "",
    description: "",
    amount: "",
    dueAt: ""
  };
}

function normalizeDueAt(value: string) {
  const trimmed = value.trim();

  if (!trimmed) {
    return "";
  }

  const supportedPatterns = [
    /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/,
    /^(\d{4})年(\d{1,2})月(\d{1,2})日?$/
  ];

  for (const pattern of supportedPatterns) {
    const match = trimmed.match(pattern);

    if (!match) {
      continue;
    }

    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const candidate = new Date(Date.UTC(year, month - 1, day));

    if (
      candidate.getUTCFullYear() !== year ||
      candidate.getUTCMonth() !== month - 1 ||
      candidate.getUTCDate() !== day
    ) {
      return trimmed;
    }

    return `${match[1]}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }

  return trimmed;
}

export function NewContractForm() {
  const router = useRouter();
  const { locale, messages } = useLocale();
  const { walletAddress, isAuthenticated } = useWallet();
  const contractCopy = messages.newContract;
  const [title, setTitle] = useState<string>("");
  const [description, setDescription] = useState<string>("");
  const [tagsInput, setTagsInput] = useState<string>("");
  const [collaborationMode, setCollaborationMode] = useState<"public" | "direct">("public");
  const [workerWallet, setWorkerWallet] = useState("");
  const [disputePolicy, setDisputePolicy] = useState<"bilateral" | "arbitrator">("bilateral");
  const [arbitratorWallet, setArbitratorWallet] = useState("");
  const [arbitratorTouched, setArbitratorTouched] = useState(false);
  const [totalAmount, setTotalAmount] = useState<string>("");
  const [milestones, setMilestones] = useState<MilestoneDraft[]>(() => [createEmptyMilestone()]);
  const [error, setError] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const milestoneTotal = useMemo((): null | string => {
    try {
      return sumAmountStrings(milestones.map((milestone) => milestone.amount || "0"));
    } catch {
      return null;
    }
  }, [milestones]);

  const totalMatches =
    milestoneTotal !== null &&
    amountIsPositive(totalAmount || "0") &&
    safeAmountsEqual(totalAmount || "0", milestoneTotal);
  const hasAmountInput =
    totalAmount.trim() !== "" || milestones.some((milestone) => milestone.amount.trim() !== "");
  const arbitratorIsValid = useMemo(() => {
    if (disputePolicy === "bilateral") return true;
    const address = arbitratorWallet.trim();
    if (!address || address === walletAddress.trim() || address === workerWallet.trim()) return false;
    try { return new PublicKey(address).toBase58() === address; } catch { return false; }
  }, [disputePolicy, arbitratorWallet, walletAddress, workerWallet]);

  const updateMilestone = (index: number, patch: Partial<MilestoneDraft>) => {
    setMilestones((current) =>
      current.map((milestone, currentIndex) =>
        currentIndex === index ? { ...milestone, ...patch } : milestone
      )
    );
  };

  const addMilestone = () => {
    setMilestones((current) => [...current, createEmptyMilestone()]);
  };

  const removeMilestone = (index: number) => {
    setMilestones((current) => {
      if (current.length <= 1) {
        return current;
      }

      return current.filter((_, currentIndex) => currentIndex !== index);
    });
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);

    try {
      const contract = await postJson<SerializedContract>("/api/contracts/create", {
        creatorWallet: walletAddress,
        workerWallet: collaborationMode === "direct" ? workerWallet.trim() : undefined,
        disputePolicy,
        arbitratorWallet: disputePolicy === "arbitrator" ? arbitratorWallet.trim() : undefined,
        title,
        description,
        tags: Array.from(
          new Set(
            tagsInput
              .split(",")
              .map((tag) => tag.trim())
              .filter(Boolean)
          )
        ),
        isPublic: collaborationMode === "public",
        totalAmount,
        milestones: milestones.map((milestone) => ({
          title: milestone.title,
          amount: milestone.amount,
          description: milestone.description || undefined,
          dueAt: normalizeDueAt(milestone.dueAt) || undefined
        }))
      });

      router.push(`/contracts/detail?id=${contract.id}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : messages.errors.failedToCreateContract);
    } finally {
      setIsSubmitting(false);
    }
  };

  const connectRequired = !isAuthenticated;

  return (
    <form className="grid gap-6 lg:grid-cols-[1fr_360px]" onSubmit={submit}>
      <div className="space-y-5">
        <Card>
          <h2 className="text-lg font-semibold">{contractCopy.sectionContract}</h2>
          <div className="mt-5 grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="title">{contractCopy.titleLabel}</Label>
              <Input
                id="title"
                value={title}
                placeholder={contractCopy.titlePlaceholder}
                onChange={(event) => setTitle(event.target.value)}
              />
            </div>
            <fieldset className="grid gap-3">
              <legend className="text-sm font-medium">{locale === "zh" ? "合作方式" : "Collaboration"}</legend>
              <div className="grid gap-3 sm:grid-cols-2">
                {(["public", "direct"] as const).map((mode) => (
                  <label key={mode} className={`flex min-h-20 cursor-pointer items-start gap-3 rounded-md border p-4 ${collaborationMode === mode ? "border-focus bg-selected" : "border-border bg-surface"}`}>
                    <input type="radio" name="collaboration-mode" className="mt-1 accent-primary" checked={collaborationMode === mode} onChange={() => setCollaborationMode(mode)} />
                    <span><span className="block text-sm font-semibold">{mode === "public" ? (locale === "zh" ? "公开招募" : "Public recruiting") : (locale === "zh" ? "指定工作者" : "Direct assignment")}</span><span className="mt-1 block text-xs leading-5 text-muted-foreground">{mode === "public" ? (locale === "zh" ? "公开展示项目，接收工作者申请。" : "Publish the project and receive applications.") : (locale === "zh" ? "直接指定钱包，创建后等待注资。" : "Assign a wallet and continue to funding.")}</span></span>
                  </label>
                ))}
              </div>
            </fieldset>
            {collaborationMode === "direct" ? <div className="grid gap-2"><Label htmlFor="worker-wallet">{contractCopy.workerWalletLabel}</Label><Input id="worker-wallet" value={workerWallet} placeholder={contractCopy.workerWalletPlaceholder} onChange={(event) => setWorkerWallet(event.target.value)} aria-invalid={workerWallet.trim() === walletAddress.trim()} />{workerWallet.trim() === walletAddress.trim() && workerWallet.trim() ? <p className="text-sm text-danger">{locale === "zh" ? "不能将自己指定为工作者。" : "You cannot assign yourself as the worker."}</p> : null}</div> : null}
            <fieldset className="grid gap-3">
              <legend className="text-sm font-medium">{contractCopy.disputePolicyLabel}</legend>
              <div className="grid gap-3 sm:grid-cols-2">
                {(["bilateral", "arbitrator"] as const).map((policy) => (
                  <label key={policy} className={`flex min-h-24 cursor-pointer items-start gap-3 rounded-md border p-4 ${disputePolicy === policy ? "border-focus bg-selected" : "border-border bg-surface"}`}>
                    <input type="radio" name="dispute-policy" className="mt-1 accent-primary" checked={disputePolicy === policy} onChange={() => setDisputePolicy(policy)} />
                    <span>
                      <span className="block text-sm font-semibold">{policy === "bilateral" ? contractCopy.bilateralPolicy : contractCopy.arbitratorPolicy}</span>
                      <span className="mt-1 block text-xs leading-5 text-muted-foreground">{policy === "bilateral" ? contractCopy.bilateralPolicyDescription : contractCopy.arbitratorPolicyDescription}</span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
            {disputePolicy === "arbitrator" ? (
              <div className="grid gap-2">
                <Label htmlFor="arbitrator-wallet">{contractCopy.arbitratorWalletLabel}</Label>
                <Input id="arbitrator-wallet" value={arbitratorWallet} placeholder={contractCopy.arbitratorWalletPlaceholder} onChange={(event) => setArbitratorWallet(event.target.value)} onBlur={() => setArbitratorTouched(true)} aria-invalid={arbitratorTouched && !arbitratorIsValid} aria-describedby={arbitratorTouched && !arbitratorIsValid ? "arbitrator-wallet-error" : undefined} />
                {arbitratorTouched && !arbitratorIsValid ? <p id="arbitrator-wallet-error" className="text-sm text-danger">{contractCopy.arbitratorWalletError}</p> : null}
              </div>
            ) : null}
            <div className="grid gap-2">
              <Label htmlFor="description">{contractCopy.descriptionLabel}</Label>
              <Textarea
                id="description"
                value={description}
                placeholder={contractCopy.descriptionPlaceholder}
                onChange={(event) => setDescription(event.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="tags">{contractCopy.tagsLabel}</Label>
              <Input
                id="tags"
                value={tagsInput}
                placeholder={contractCopy.tagsPlaceholder}
                onChange={(event) => setTagsInput(event.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="creator">{contractCopy.creatorWalletLabel}</Label>
              <Input
                id="creator"
                value={walletAddress}
                placeholder={contractCopy.creatorWalletPlaceholder}
                readOnly
              />
            </div>
          </div>
        </Card>

        <Card>
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">{contractCopy.sectionMilestones}</h2>
            <Button type="button" variant="secondary" onClick={addMilestone}>
              <Plus className="mr-2 size-4" aria-hidden="true" />
              {contractCopy.addMilestone}
            </Button>
          </div>
          <div className="mt-5 space-y-4">
            {milestones.map((milestone, index) => (
              <div key={milestone.key} className="rounded-lg border border-border p-4">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <h3 className="font-semibold">
                    {messages.contractDetail.milestoneItem} {index + 1}
                  </h3>
                  {milestones.length > 1 ? (
                    <Button
                      type="button"
                      variant="ghost"
                      className="size-9 px-0"
                      onClick={() => removeMilestone(index)}
                      title={contractCopy.removeMilestone}
                    >
                      <Trash2 className="size-4" aria-hidden="true" />
                    </Button>
                  ) : null}
                </div>
                <div className="grid gap-4">
                  <div className="grid gap-2">
                    <Label>{contractCopy.milestoneTitleLabel}</Label>
                    <Input
                      value={milestone.title}
                      placeholder={contractCopy.milestoneTitlePlaceholder}
                      onChange={(event) => updateMilestone(index, { title: event.target.value })}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label>{contractCopy.milestoneDescriptionLabel}</Label>
                    <Textarea
                      value={milestone.description}
                      placeholder={contractCopy.milestoneDescriptionPlaceholder}
                      onChange={(event) =>
                        updateMilestone(index, { description: event.target.value })
                      }
                    />
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="grid gap-2">
                      <Label>{contractCopy.milestoneAmountLabel}</Label>
                      <Input
                        inputMode="decimal"
                        value={milestone.amount}
                        placeholder={contractCopy.milestoneAmountPlaceholder}
                        onChange={(event) => updateMilestone(index, { amount: event.target.value })}
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label>{contractCopy.dueDateLabel}</Label>
                      <Input
                        type="text"
                        inputMode="numeric"
                        value={milestone.dueAt}
                        placeholder={contractCopy.dueDatePlaceholder}
                        onChange={(event) => updateMilestone(index, { dueAt: event.target.value })}
                        onBlur={(event) =>
                          updateMilestone(index, { dueAt: normalizeDueAt(event.target.value) })
                        }
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
          <h2 className="text-lg font-semibold">{contractCopy.sectionFunding}</h2>
          <div className="mt-5 space-y-4">
            <div className="grid gap-2">
              <Label htmlFor="totalAmount">{contractCopy.contractTotalLabel}</Label>
              <Input
                id="totalAmount"
                inputMode="decimal"
                value={totalAmount}
                placeholder={contractCopy.milestoneAmountPlaceholder}
                onChange={(event) => setTotalAmount(event.target.value)}
              />
            </div>
            <div className="rounded-lg bg-muted p-4">
              <div className="flex justify-between gap-3 text-sm">
                <span className="text-muted-foreground">{contractCopy.milestoneTotalLabel}</span>
                <span className="font-semibold">{formatUsdc(milestoneTotal ?? "0", locale)}</span>
              </div>
              <div className="mt-2 flex justify-between gap-3 text-sm">
                <span className="text-muted-foreground">{contractCopy.contractTotalLabel}</span>
                <span className="font-semibold">{formatUsdc(totalAmount, locale)}</span>
              </div>
            </div>
            {connectRequired ? (
              <p className="rounded-md border border-warning/30 bg-warning/10 p-3 text-sm text-warning">
                {contractCopy.connectNotice}
              </p>
            ) : null}
            {!totalMatches && hasAmountInput ? (
              <p className="rounded-md border border-warning/30 bg-warning/10 p-3 text-sm text-warning">
                {contractCopy.mismatchError}
              </p>
            ) : null}
            {error ? <p className="rounded-md border border-danger/30 bg-danger/10 p-3 text-sm text-danger">{error}</p> : null}
            <Button
              type="submit"
              className="w-full"
              disabled={connectRequired || !totalMatches || !arbitratorIsValid || isSubmitting || (collaborationMode === "direct" && (!workerWallet.trim() || workerWallet.trim() === walletAddress.trim()))}
            >
              {isSubmitting ? contractCopy.submitting : contractCopy.submit}
            </Button>
          </div>
        </Card>
      </aside>
    </form>
  );
}
