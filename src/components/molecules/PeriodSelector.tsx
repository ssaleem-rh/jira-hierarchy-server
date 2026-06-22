"use client";

import { cn } from "@/lib/utils";
import { PERIODS } from "@/constants/periods";
import type { Period } from "@/types";

interface PeriodSelectorProps {
  value: Period;
  onChange: (p: Period) => void;
}

export function PeriodSelector({ value, onChange }: PeriodSelectorProps) {
  return (
    <div className="flex gap-1 rounded-lg border border-border bg-muted p-1">
      {PERIODS.map((p) => (
        <button
          key={p.value}
          onClick={() => onChange(p.value)}
          className={cn(
            "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
            value === p.value
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          {p.label}
        </button>
      ))}
    </div>
  );
}
