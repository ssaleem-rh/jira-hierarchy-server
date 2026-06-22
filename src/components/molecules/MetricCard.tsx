import { cn } from "@/lib/utils";

interface MetricCardProps {
  label: string;
  value: number | string;
  sub?: string;
  accent?: string;
  className?: string;
}

export function MetricCard({ label, value, sub, accent, className }: MetricCardProps) {
  return (
    <div
      className={cn(
        "rounded-lg border border-border bg-card p-4 flex flex-col gap-1",
        className
      )}
    >
      <p className="text-xs text-muted-foreground uppercase tracking-wider">{label}</p>
      <p className={cn("text-3xl font-bold tabular-nums", accent ?? "text-foreground")}>
        {value}
      </p>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}
