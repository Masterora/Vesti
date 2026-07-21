"use client";

import { NewContractForm } from "@/components/contracts/new-contract-form";
import { useLocale } from "@/components/i18n/locale-provider";

export default function NewContractPage() {
  const { locale, messages } = useLocale();
  const copy = messages.newContractPage;

  return (
    <div className="page-shell py-10">
      <div className="mb-7">
        <p className="text-sm font-semibold uppercase tracking-wide text-primary">{copy.eyebrow}</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight md:text-4xl">{copy.title}</h1>
        <p className="mt-3 max-w-2xl text-muted-foreground">{copy.description}</p>
      </div>
      <NewContractForm key={locale} />
    </div>
  );
}
