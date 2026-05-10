import Link from "next/link";
import { ArrowRight, CheckCircle2, CircleDollarSign, FileCheck2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { getMessages } from "@/lib/i18n/messages";
import { getServerLocale } from "@/lib/i18n/server-locale";

const stepIcons = [FileCheck2, CircleDollarSign, CheckCircle2] as const;

export default async function HomePage() {
  const locale = await getServerLocale();
  const copy = getMessages(locale).landing;

  return (
    <div className="page-shell py-10 md:py-16">
      <section className="grid gap-10 lg:grid-cols-[1fr_420px] lg:items-center">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-primary">{copy.eyebrow}</p>
          <h1 className="mt-4 max-w-3xl text-4xl font-semibold tracking-tight md:text-6xl">
            {copy.title}
          </h1>
          <p className="mt-5 max-w-2xl text-lg leading-8 text-muted-foreground">
            {copy.description}
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/dashboard">
              <Button type="button">
                {copy.openDashboard}
                <ArrowRight className="ml-2 size-4" aria-hidden="true" />
              </Button>
            </Link>
            <Link href="/contracts/new">
              <Button type="button" variant="secondary">{copy.createContract}</Button>
            </Link>
          </div>
        </div>
        <Card className="p-0">
          <div className="border-b border-border p-5">
            <p className="text-sm font-semibold text-muted-foreground">{copy.flowTitle}</p>
          </div>
          <div className="divide-y divide-border">
            {copy.steps.map((step, index) => {
              const Icon = stepIcons[index];

              return (
                <div key={step.title} className="flex gap-4 p-5">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-muted text-primary">
                    <Icon className="size-5" aria-hidden="true" />
                  </span>
                  <div>
                    <h2 className="font-semibold">{step.title}</h2>
                    <p className="mt-1 text-sm leading-6 text-muted-foreground">{step.text}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      </section>
    </div>
  );
}
