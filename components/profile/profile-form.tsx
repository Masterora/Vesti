"use client";

import { Camera, Copy, Wallet } from "lucide-react";
import { useRef, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import { useLocale } from "@/components/i18n/locale-provider";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";
import { ProfileAvatar } from "@/components/ui/profile-avatar";
import { useWallet } from "@/components/wallet/wallet-provider";
import { convertImageFileToPixelAvatar } from "@/lib/profile/avatar-client";
import { formatDate, shortenWallet } from "@/lib/utils";

const maxAvatarUploadBytes = 5 * 1024 * 1024;

export function ProfileForm() {
  const { locale, messages } = useLocale();
  const { isAuthenticated, sessionWalletAddress, sessionProfile, updateProfile } = useWallet();
  const [draftProfile, setDraftProfile] = useState(sessionProfile);
  const [draft, setDraft] = useState({
    displayName: sessionProfile?.displayName ?? "",
    email: sessionProfile?.email ?? "",
    bio: sessionProfile?.bio ?? "",
    avatarImage: sessionProfile?.avatarImage ?? ""
  });
  const [status, setStatus] = useState("");
  const [isError, setIsError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  if (sessionProfile !== draftProfile) {
    setDraftProfile(sessionProfile);
    setDraft({
      displayName: sessionProfile?.displayName ?? "",
      email: sessionProfile?.email ?? "",
      bio: sessionProfile?.bio ?? "",
      avatarImage: sessionProfile?.avatarImage ?? ""
    });
  }

  const handleImage = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]; event.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/") || file.size > maxAvatarUploadBytes) {
      setIsError(true); setStatus(file.size > maxAvatarUploadBytes ? messages.wallet.avatarTooLarge : messages.wallet.avatarInvalidType); return;
    }
    setPreparing(true); setStatus("");
    try {
      const avatarImage = await convertImageFileToPixelAvatar(file);
      setDraft((current) => ({ ...current, avatarImage }));
      setStatus(messages.wallet.avatarReady);
      setIsError(false);
    }
    catch (caught) { setIsError(true); setStatus((caught as Error).message); }
    finally { setPreparing(false); }
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault(); setSaving(true); setStatus("");
    try { await updateProfile(draft); setStatus(messages.wallet.profileSaved); setIsError(false); }
    catch (caught) { setStatus((caught as Error).message); setIsError(true); }
    finally { setSaving(false); }
  };

  if (!isAuthenticated || !sessionWalletAddress) {
    return <div className="rounded-md border border-border bg-surface p-8 text-center"><Wallet className="mx-auto size-8 text-muted-foreground" /><h2 className="mt-4 text-lg font-semibold">{locale === "zh" ? "连接钱包后编辑资料" : "Connect your wallet to edit your profile"}</h2><p className="mt-2 text-sm text-muted-foreground">{messages.dashboard.connectDescription}</p></div>;
  }

  return (
    <form onSubmit={submit} className="grid gap-8">
      <section className="flex flex-col gap-5 border-b border-border pb-8 sm:flex-row sm:items-center">
        <button type="button" className="group relative size-24 shrink-0 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus" onClick={() => inputRef.current?.click()} disabled={preparing || saving} aria-label={messages.wallet.importAvatar}>
          <ProfileAvatar walletAddress={sessionWalletAddress} displayName={draft.displayName} avatarImage={draft.avatarImage} className="size-24 rounded-md" loading="eager" />
          <span className="absolute inset-0 flex items-center justify-center rounded-md bg-black/55 opacity-0 transition group-hover:opacity-100 group-focus-visible:opacity-100"><Camera className="size-5" /></span>
        </button>
        <div><h2 className="font-semibold">{draft.displayName || shortenWallet(sessionWalletAddress)}</h2><p className="mt-1 text-sm text-muted-foreground">{messages.wallet.avatarRequirements}</p><Button type="button" variant="secondary" className="mt-3" onClick={() => inputRef.current?.click()} disabled={preparing}>{preparing ? messages.wallet.avatarPreparing : messages.wallet.importAvatar}</Button></div>
        <input ref={inputRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="sr-only" onChange={(event) => void handleImage(event)} />
      </section>

      <section className="grid gap-5">
        <div className="grid gap-2"><Label htmlFor="profile-name">{messages.wallet.displayName}</Label><Input id="profile-name" maxLength={40} value={draft.displayName} onChange={(event) => setDraft((current) => ({ ...current, displayName: event.target.value }))} /><p className="text-right text-xs text-muted-foreground">{draft.displayName.length}/40</p></div>
        <div className="grid gap-2"><Label htmlFor="profile-email">{messages.wallet.email}</Label><Input id="profile-email" type="email" maxLength={120} value={draft.email} onChange={(event) => setDraft((current) => ({ ...current, email: event.target.value }))} /></div>
        <div className="grid gap-2"><Label htmlFor="profile-bio">{messages.wallet.bio}</Label><Textarea id="profile-bio" maxLength={280} className="min-h-32" value={draft.bio} onChange={(event) => setDraft((current) => ({ ...current, bio: event.target.value }))} /><p className="text-right text-xs text-muted-foreground">{draft.bio.length}/280</p></div>
      </section>

      <section className="rounded-md border border-border bg-surface p-5">
        <h2 className="text-sm font-semibold">{messages.wallet.connectedWallet}</h2>
        <div className="mt-4 grid gap-4 text-sm sm:grid-cols-3"><div><p className="text-xs text-muted-foreground">{messages.wallet.walletAddress}</p><button type="button" className="mt-1 inline-flex items-center gap-2 font-mono text-focus" onClick={() => void navigator.clipboard.writeText(sessionWalletAddress)}>{shortenWallet(sessionWalletAddress)} <Copy className="size-3" /></button></div><div><p className="text-xs text-muted-foreground">{messages.wallet.joined}</p><p className="mt-1">{formatDate(sessionProfile?.joinedAt, locale)}</p></div><div><p className="text-xs text-muted-foreground">{messages.wallet.completedContracts}</p><p className="mt-1">{sessionProfile?.completedContractsCount ?? 0}</p></div></div>
      </section>

      {status ? <p role="status" className={isError ? "text-sm text-danger" : "text-sm text-success"}>{status}</p> : null}
      <div className="flex justify-end"><Button type="submit" disabled={saving || preparing}>{saving ? messages.wallet.savingProfile : messages.wallet.saveProfile}</Button></div>
    </form>
  );
}
