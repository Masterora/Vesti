import Link from "next/link";
import { ArrowRight, CheckCircle2, CircleDollarSign, FileCheck2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

const steps = [
  {
    title: "Create",
    text: "Creator defines a contract, Worker wallet, and milestone amounts.",
    icon: FileCheck2
  },
  {
    title: "Fund",
    text: "Escrow is funded in mock mode so the full product flow can be demonstrated.",
    icon: CircleDollarSign
  },
  {
    title: "Release",
    text: "Worker submits proof, Creator approves, and milestone payment is released.",
    icon: CheckCircle2
  }
];

export default function HomePage() {
  return (
    <div className="page-shell py-10 md:py-16">
      <section className="grid gap-10 lg:grid-cols-[1fr_420px] lg:items-center">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-primary">
            USDC milestone escrow
          </p>
          <h1 className="mt-4 max-w-3xl text-4xl font-semibold tracking-tight md:text-6xl">
            Remote work payments with milestone-level control.
          </h1>
          <p className="mt-5 max-w-2xl text-lg leading-8 text-muted-foreground">
            Vesti helps a Creator fund a contract, lets a Worker submit proof, and tracks approval,
            release, and audit events through a simple escrow workflow.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/dashboard">
              <Button type="button">
                Open dashboard
                <ArrowRight className="ml-2 size-4" aria-hidden="true" />
              </Button>
            </Link>
            <Link href="/contracts/new">
              <Button type="button" variant="secondary">
                Create contract
              </Button>
            </Link>
          </div>
        </div>
        <Card className="p-0">
          <div className="border-b border-border p-5">
            <p className="text-sm font-semibold text-muted-foreground">Demo flow</p>
          </div>
          <div className="divide-y divide-border">
            {steps.map((step) => {
              const Icon = step.icon;

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
