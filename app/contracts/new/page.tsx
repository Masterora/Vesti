import { NewContractForm } from "@/components/contracts/new-contract-form";

export default function NewContractPage() {
  return (
    <div className="page-shell py-10">
      <div className="mb-7">
        <p className="text-sm font-semibold uppercase tracking-wide text-primary">Create</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight md:text-4xl">New escrow contract</h1>
        <p className="mt-3 max-w-2xl text-muted-foreground">
          Define the Worker wallet, total USDC amount, and milestone split before funding.
        </p>
      </div>
      <NewContractForm />
    </div>
  );
}
