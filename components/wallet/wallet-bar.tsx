"use client";

import { LogOut, PencilLine, UserRound, Wallet } from "lucide-react";
import { useState } from "react";
import { useLocale } from "@/components/i18n/locale-provider";
import { Badge } from "@/components/ui/badge";
import { useWallet } from "./wallet-provider";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";
import { formatDate, shortenWallet } from "@/lib/utils";

export function WalletBar() {
  const { locale, messages } = useLocale();
  const {
    walletAddress,
    setWalletAddress,
    selectDemoWallet,
    connectWallet,
    disconnectWallet,
    defaultWallets,
    authError,
    hasInjectedWallet,
    isAuthenticated,
    isConnecting,
    sessionWalletAddress,
    sessionProfile,
    updateProfile,
    demoWalletsEnabled
  } = useWallet();
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [profileDraft, setProfileDraft] = useState({
    displayName: "",
    email: "",
    bio: ""
  });
  const [profileStatus, setProfileStatus] = useState("");
  const [profileStatusTone, setProfileStatusTone] = useState<"success" | "error">("success");
  const [isSavingProfile, setIsSavingProfile] = useState(false);

  const saveProfile = async () => {
    setIsSavingProfile(true);
    setProfileStatus("");
    setProfileStatusTone("success");

    try {
      await updateProfile(profileDraft);
      setProfileStatus(messages.wallet.profileSaved);
      setIsEditingProfile(false);
    } catch (caught) {
      setProfileStatusTone("error");
      setProfileStatus(
        caught instanceof Error ? caught.message : messages.errors.failedToUpdateProfile
      );
    } finally {
      setIsSavingProfile(false);
    }
  };

  return (
    <div className="relative flex min-w-0 flex-col items-end gap-1">
      <div className="flex min-w-0 items-center gap-2">
        {demoWalletsEnabled ? (
          <div className="flex min-w-0 max-w-[11rem] items-center gap-2 rounded-md border border-border bg-white px-2 py-1.5 sm:max-w-none">
            <UserRound className="size-4 text-muted-foreground" aria-hidden="true" />
            <Input
              aria-label={messages.wallet.walletAddress}
              className="h-7 w-28 border-0 px-1 focus:ring-0 sm:w-52"
              value={walletAddress}
              placeholder={messages.wallet.walletAddress}
              onChange={(event) => setWalletAddress(event.target.value)}
              readOnly={isAuthenticated}
              title={
                isAuthenticated
                  ? messages.wallet.authenticatedSession
                  : messages.wallet.demoWalletAddress
              }
            />
          </div>
        ) : isAuthenticated && sessionWalletAddress ? (
          <div className="flex min-w-0 max-w-[14rem] items-center gap-2 rounded-md border border-border bg-white px-3 py-1.5 sm:max-w-none">
            <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
              {getProfileInitial(sessionProfile?.displayName, sessionWalletAddress)}
            </div>
            <Badge value="connected" label={messages.wallet.connectedWallet} />
            <div className="min-w-0">
              <p
                className="max-w-28 truncate text-sm font-medium text-foreground sm:max-w-52"
                title={sessionProfile?.displayName || sessionWalletAddress}
              >
                {sessionProfile?.displayName || shortenWallet(sessionWalletAddress)}
              </p>
              {sessionProfile?.displayName ? (
                <p
                  className="max-w-28 truncate text-xs text-muted-foreground sm:max-w-52"
                  title={sessionWalletAddress ?? undefined}
                >
                  {shortenWallet(sessionWalletAddress)}
                </p>
              ) : null}
            </div>
          </div>
        ) : null}
        {isAuthenticated ? (
          <Button
            type="button"
            variant="secondary"
            className="h-8 px-3"
            onClick={() => {
              setProfileStatus("");
              setIsEditingProfile((current) => {
                const next = !current;

                if (next) {
                  setProfileDraft({
                    displayName: sessionProfile?.displayName ?? "",
                    email: sessionProfile?.email ?? "",
                    bio: sessionProfile?.bio ?? ""
                  });
                }

                return next;
              });
            }}
            title={isEditingProfile ? messages.wallet.closeProfile : messages.wallet.editProfile}
          >
            <PencilLine className="mr-2 size-4" aria-hidden="true" />
            {messages.wallet.profile}
          </Button>
        ) : null}
        {isAuthenticated ? (
          <Button
            type="button"
            variant="secondary"
            className="h-8 px-3"
            onClick={() => void disconnectWallet()}
            title={messages.wallet.disconnectTitle}
          >
            <LogOut className="mr-2 size-4" aria-hidden="true" />
            {messages.wallet.disconnect}
          </Button>
        ) : (
          <Button
            type="button"
            variant={hasInjectedWallet ? "primary" : "secondary"}
            className="h-8 px-3"
            onClick={() => void connectWallet()}
            disabled={isConnecting}
            title={hasInjectedWallet ? messages.wallet.connectTitle : messages.wallet.installTitle}
          >
            <Wallet className="mr-2 size-4" aria-hidden="true" />
            {isConnecting ? messages.wallet.connecting : messages.wallet.connect}
          </Button>
        )}
        {demoWalletsEnabled ? (
          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant={!isAuthenticated && walletAddress === defaultWallets.creator ? "primary" : "secondary"}
              className="h-8 px-3"
              onClick={() => void selectDemoWallet(defaultWallets.creator)}
              title={defaultWallets.creator}
            >
              {messages.wallet.demoCreator}
            </Button>
            <Button
              type="button"
              variant={!isAuthenticated && walletAddress === defaultWallets.worker ? "primary" : "secondary"}
              className="h-8 px-3"
              onClick={() => void selectDemoWallet(defaultWallets.worker)}
              title={defaultWallets.worker}
            >
              {messages.wallet.demoWorker}
            </Button>
          </div>
        ) : null}
      </div>
      {isAuthenticated && isEditingProfile ? (
        <div className="fixed right-4 top-20 z-50 w-[min(22rem,calc(100vw-2rem))] rounded-xl border border-border bg-white p-4 shadow-xl">
          <div className="grid gap-3">
            <div className="flex items-center gap-3 rounded-lg bg-muted/50 p-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                {getProfileInitial(sessionProfile?.displayName, sessionWalletAddress)}
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-foreground">
                  {sessionProfile?.displayName || shortenWallet(sessionWalletAddress ?? "")}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {shortenWallet(sessionWalletAddress ?? "")}
                </p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 rounded-lg border border-border bg-muted/30 p-3 text-sm">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {messages.wallet.joined}
                </p>
                <p className="mt-1 font-medium text-foreground">
                  {formatDate(sessionProfile?.joinedAt, locale)}
                </p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {messages.wallet.completedContracts}
                </p>
                <p className="mt-1 font-medium text-foreground">
                  {sessionProfile?.completedContractsCount ?? 0}
                </p>
              </div>
            </div>
            <div className="grid gap-2">
              <Label>{messages.wallet.displayName}</Label>
              <Input
                value={profileDraft.displayName}
                onChange={(event) =>
                  setProfileDraft((current) => ({
                    ...current,
                    displayName: event.target.value
                  }))
                }
                placeholder={messages.wallet.displayNamePlaceholder}
              />
            </div>
            <div className="grid gap-2">
              <Label>{messages.wallet.email}</Label>
              <Input
                type="email"
                value={profileDraft.email}
                onChange={(event) =>
                  setProfileDraft((current) => ({
                    ...current,
                    email: event.target.value
                  }))
                }
                placeholder={messages.wallet.emailPlaceholder}
              />
            </div>
            <div className="grid gap-2">
              <Label>{messages.wallet.bio}</Label>
              <Textarea
                value={profileDraft.bio}
                onChange={(event) =>
                  setProfileDraft((current) => ({
                    ...current,
                    bio: event.target.value
                  }))
                }
                placeholder={messages.wallet.bioPlaceholder}
                className="min-h-24"
              />
            </div>
            <div className="flex justify-end">
              <Button type="button" onClick={() => void saveProfile()} disabled={isSavingProfile}>
                {isSavingProfile ? messages.wallet.savingProfile : messages.wallet.saveProfile}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
      {authError ? <p className="max-w-sm text-right text-xs text-danger">{authError}</p> : null}
      {!authError && profileStatus ? (
        <p
          className={`max-w-sm text-right text-xs ${
            profileStatusTone === "error" ? "text-danger" : "text-emerald-700"
          }`}
        >
          {profileStatus}
        </p>
      ) : null}
    </div>
  );
}

function getProfileInitial(displayName: string | null | undefined, walletAddress: string | null) {
  const source = displayName?.trim() || walletAddress || "?";

  return source.charAt(0).toUpperCase();
}
