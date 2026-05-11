"use client";

import { Plus, Trash2 } from "lucide-react";
import type { FormEvent } from "react";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
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
  title: string;
  description: string;
  amount: string;
  dueAt: string;
};

function createEmptyMilestone(): MilestoneDraft {
  return {
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
  const { walletAddress, isAuthenticated, demoWalletsEnabled } = useWallet();
  const contractCopy = messages.newContract;
  const [title, setTitle] = useState<string>("");
  const [description, setDescription] = useState<string>("");
  const [tagsInput, setTagsInput] = useState<string>("");
  const [isPublic, setIsPublic] = useState(true);
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
    setMilestones((current) => current.filter((_, currentIndex) => currentIndex !== index));
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);

    try {
      const contract = await postJson<SerializedContract>("/api/contracts/create", {
        creatorWallet: walletAddress,
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
        isPublic,
        totalAmount,
        milestones: milestones.map((milestone) => ({
          ...milestone,
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

  const connectRequired = !isAuthenticated && !demoWalletsEnabled;

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
            <label className="flex items-start gap-3 rounded-lg border border-border p-3">
              <input
                type="checkbox"
                className="mt-1 size-4 accent-primary"
                checked={isPublic}
                onChange={(event) => setIsPublic(event.target.checked)}
              />
              <div>
                <p className="text-sm font-medium">{contractCopy.publicTitle}</p>
                <p className="mt-1 text-sm text-muted-foreground">{contractCopy.publicDescription}</p>
              </div>
            </label>
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
              <div key={index} className="rounded-lg border border-border p-4">
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
              <p className="rounded-md bg-amber-50 p-3 text-sm text-amber-800">
                {contractCopy.connectNotice}
              </p>
            ) : null}
            {!totalMatches && hasAmountInput ? (
              <p className="rounded-md bg-amber-50 p-3 text-sm text-amber-800">
                {contractCopy.mismatchError}
              </p>
            ) : null}
            {error ? <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
            <Button
              type="submit"
              className="w-full"
              disabled={connectRequired || !totalMatches || isSubmitting}
            >
              {isSubmitting ? contractCopy.submitting : contractCopy.submit}
            </Button>
          </div>
        </Card>
      </aside>
    </form>
  );
}
