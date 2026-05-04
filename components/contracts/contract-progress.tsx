import { formatUsdc } from "@/lib/utils";

type ContractProgressProps = {
  totalAmount: string;
  fundedAmount: string;
  releasedAmount: string;
};

export function ContractProgress({
  totalAmount,
  fundedAmount,
  releasedAmount
}: ContractProgressProps) {
  const total = Number(totalAmount);
  const funded = Number(fundedAmount);
  const released = Number(releasedAmount);
  const fundedPercent = total > 0 ? Math.min((funded / total) * 100, 100) : 0;
  const releasedPercent = total > 0 ? Math.min((released / total) * 100, 100) : 0;

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <AmountStat label="Total" value={formatUsdc(totalAmount)} />
        <AmountStat label="Funded" value={formatUsdc(fundedAmount)} />
        <AmountStat label="Released" value={formatUsdc(releasedAmount)} />
      </div>
      <div className="h-3 overflow-hidden rounded-full bg-muted">
        <div className="relative h-full" style={{ width: `${fundedPercent}%` }}>
          <div className="absolute inset-0 bg-teal-200" />
          <div className="absolute inset-y-0 left-0 bg-primary" style={{ width: `${releasedPercent}%` }} />
        </div>
      </div>
    </div>
  );
}

function AmountStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-lg font-semibold text-foreground">{value}</p>
    </div>
  );
}
