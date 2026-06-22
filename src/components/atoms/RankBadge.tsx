export function RankBadge({ rank }: { rank: number }) {
  return (
    <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground ring-1 ring-border">
      {rank}
    </span>
  );
}
