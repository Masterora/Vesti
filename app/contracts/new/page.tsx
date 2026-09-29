"use client";

import { NewContractForm } from "@/components/contracts/new-contract-form";
import { useLocale } from "@/components/i18n/locale-provider";

export default function NewContractPage() {
  const { locale, messages } = useLocale();
  const copy = messages.newContractPage;

  return (
    <div className="workspace-shell max-w-[1280px]">
      <div className="mb-7">
        <h1 className="text-[28px] font-semibold leading-9 tracking-tight">{copy.title}</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{copy.description}</p>
      </div>
      <NewContractForm key={locale} />
    </div>
  );
}
