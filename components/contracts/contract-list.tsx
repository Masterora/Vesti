"use client";

import Link from "next/link";
import { FileText } from "lucide-react";
import { useLocale } from "@/components/i18n/locale-provider";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { ProfileAvatar } from "@/components/ui/profile-avatar";
import { ContractProgress } from "@/components/contracts/contract-progress";
import { getWalletAvatarImage, getWalletDisplayLabel, getWalletDisplayName } from "@/lib/display-profiles";
import { shortenWallet } from "@/lib/utils";
import type { SerializedContractListItem } from "@/types/contract";

export function ContractList({
  contracts,
  walletAddress
}: {
  contracts: SerializedContractListItem[];
  walletAddress: string;
}) {
  const { locale, messages } = useLocale();

  if (contracts.length === 0) {
    return (
      <Card className="flex min-h-64 items-center justify-center text-center">
        <div>
          <FileText className="mx-auto size-10 text-muted-foreground" aria-hidden="true" />
          <h2 className="mt-4 text-xl font-semibold">{messages.contractList.emptyTitle}</h2>
          <p className="mt-2 max-w-md text-sm text-muted-foreground">
            {messages.contractList.emptyDescription}
          </p>
        </div>
      </Card>
    );
  }

  return (
    <div className="grid gap-4">
      {contracts.map((contract) => {
        const tags = contract.tags ?? [];
        const pendingApplicants = contract.pendingApplicantWallets;
        const relation =
          walletAddress === contract.creatorWallet
            ? "creator"
            : walletAddress === contract.workerWallet
              ? "worker"
              : pendingApplicants.includes(walletAddress)
                ? "applicant"
                : "viewer";
        const milestoneCount =
          locale === "zh"
            ? `${contract.milestoneCount}${messages.contractList.milestones}`
            : `${contract.milestoneCount} ${messages.contractList.milestones}`;
        const workerLabel = contract.workerWallet
          ? getWalletDisplayLabel(contract.profiles, contract.workerWallet)
          : pendingApplicants.length > 0
            ? `${messages.contractList.applicants} ${pendingApplicants
                .map((wallet) => getWalletDisplayLabel(contract.profiles, wallet))
                .join(", ")}`
            : messages.contractList.unassigned;
        const creatorDisplayName = getWalletDisplayName(contract.profiles, contract.creatorWallet);
        const creatorAvatarImage = getWalletAvatarImage(contract.profiles, contract.creatorWallet);
        const workerDisplayName = contract.workerWallet
          ? getWalletDisplayName(contract.profiles, contract.workerWallet)
          : null;
        const workerAvatarImage = contract.workerWallet
          ? getWalletAvatarImage(contract.profiles, contract.workerWallet)
          : null;
        const nextStepHint =
          relation === "creator" && contract.status === "claimed"
            ? messages.contractList.creatorClaimHint
            : relation === "creator" && contract.status === "draft"
              ? messages.contractList.creatorFundHint
              : relation === "applicant" && contract.status === "claimed"
                ? messages.contractList.applicantPendingHint
                : relation === "viewer" && contract.status === "open"
                  ? messages.contractList.viewerClaimHint
                  : null;

        return (
          <Link key={contract.id} href={`/contracts/detail?id=${contract.id}`}>
            <Card className="transition hover:-translate-y-0.5 hover:border-primary/40">
              <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-xl font-semibold">{contract.title}</h2>
                    <Badge value={contract.status} />
                    <Badge
                      value={contract.isPublic ? "public" : "private"}
                      label={contract.isPublic ? messages.contractList.public : messages.contractList.private}
                    />
                  </div>
                  <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">
                    {contract.description || messages.contractList.noDescription}
                  </p>
                  <p className="mt-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    {messages.contractList.idLabel} {contract.displayId}
                  </p>
                  {nextStepHint ? (
                    <p className="mt-3 text-sm font-medium text-primary">{nextStepHint}</p>
                  ) : null}
                  {tags.length > 0 ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {tags.map((tag) => (
                        <Badge key={tag} value="public" label={`#${tag}`} className="font-medium" />
                      ))}
                    </div>
                  ) : null}
                  <div className="mt-4 flex flex-wrap gap-4 text-xs text-muted-foreground">
                    <div className="flex min-w-0 items-center gap-2">
                      <ProfileAvatar
                        walletAddress={contract.creatorWallet}
                        displayName={creatorDisplayName}
                        avatarImage={creatorAvatarImage}
                        className="size-8 shrink-0 rounded-md"
                      />
                      <div className="min-w-0">
                        <p>
                          <span className="font-semibold text-blue-700">{messages.contractList.creator}</span>{" "}
                          {creatorDisplayName ?? shortenWallet(contract.creatorWallet)}
                        </p>
                        {creatorDisplayName ? (
                          <p className="truncate text-[11px] text-muted-foreground">{shortenWallet(contract.creatorWallet)}</p>
                        ) : null}
                      </div>
                    </div>
                    <div className="flex min-w-0 items-center gap-2">
                      {contract.workerWallet ? (
                        <ProfileAvatar
                          walletAddress={contract.workerWallet}
                          displayName={workerDisplayName}
                          avatarImage={workerAvatarImage}
                          className="size-8 shrink-0 rounded-md"
                        />
                      ) : null}
                      <div className="min-w-0">
                        <p>
                          <span className="font-semibold text-emerald-700">
                            {contract.workerWallet ? messages.contractList.worker : messages.contractList.applicants}
                          </span>{" "}
                          {workerDisplayName && contract.workerWallet
                            ? workerDisplayName
                            : workerLabel}
                        </p>
                        {workerDisplayName && contract.workerWallet ? (
                          <p className="truncate text-[11px] text-muted-foreground">{shortenWallet(contract.workerWallet)}</p>
                        ) : null}
                      </div>
                    </div>
                    <span className="self-center">{milestoneCount}</span>
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
