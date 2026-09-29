"use client";

import { useLocale } from "@/components/i18n/locale-provider";
import { ProfileForm } from "@/components/profile/profile-form";

export default function ProfilePage() {
  const { locale } = useLocale();
  return <div className="workspace-shell"><div className="mx-auto max-w-[720px]"><header className="mb-8"><h1 className="text-[28px] font-semibold leading-9 tracking-tight">{locale === "zh" ? "个人资料" : "Profile"}</h1><p className="mt-1 text-sm text-muted-foreground">{locale === "zh" ? "管理公开身份、联系信息和钱包连接。" : "Manage your public identity, contact details, and wallet connection."}</p></header><ProfileForm /></div></div>;
}
