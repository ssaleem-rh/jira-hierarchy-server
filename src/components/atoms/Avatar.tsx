import { cn } from "@/lib/utils";

interface AvatarProps {
  name: string;
  className?: string;
  size?: "sm" | "md" | "lg";
}

const sizes = {
  sm: "h-7 w-7 text-xs",
  md: "h-9 w-9 text-sm",
  lg: "h-12 w-12 text-base",
};

const colors = [
  "bg-violet-500",
  "bg-blue-500",
  "bg-emerald-500",
  "bg-amber-500",
  "bg-rose-500",
  "bg-cyan-500",
  "bg-indigo-500",
  "bg-fuchsia-500",
];

function colorFor(name: string) {
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) & 0xffffffff;
  return colors[Math.abs(hash) % colors.length];
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function Avatar({ name, className, size = "md" }: AvatarProps) {
  return (
    <div
      className={cn(
        "flex items-center justify-center rounded-full font-semibold text-white shrink-0",
        sizes[size],
        colorFor(name),
        className
      )}
    >
      {initials(name)}
    </div>
  );
}
