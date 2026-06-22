import { cn } from "@/lib/utils";

type Variant = "default" | "success" | "warning" | "danger" | "muted" | "info";

interface BadgeProps {
  children: React.ReactNode;
  variant?: Variant;
  className?: string;
}

const variants: Record<Variant, string> = {
  default: "bg-primary/10 text-primary border-primary/20",
  success: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  warning: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  danger: "bg-red-500/10 text-red-400 border-red-500/20",
  muted: "bg-muted text-muted-foreground border-border",
  info: "bg-blue-500/10 text-blue-400 border-blue-500/20",
};

export function Badge({ children, variant = "default", className }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium",
        variants[variant],
        className
      )}
    >
      {children}
    </span>
  );
}

export function statusVariant(status: string): Variant {
  const s = status.toLowerCase();
  if (s === "done" || s === "closed" || s === "resolved") return "success";
  if (s === "in progress" || s === "in review") return "info";
  if (s === "blocked") return "danger";
  if (s === "to do" || s === "backlog" || s === "open") return "muted";
  return "default";
}

export function prStateVariant(state: string): Variant {
  if (state === "MERGED") return "success";
  if (state === "OPEN") return "info";
  if (state === "CLOSED") return "danger";
  return "muted";
}
