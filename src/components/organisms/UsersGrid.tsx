"use client";

import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { Avatar } from "@/components/atoms/Avatar";
import { Spinner } from "@/components/atoms/Spinner";
import { useUsers } from "@/hooks/useLeaderboard";

export function UsersGrid() {
  const { data, isLoading, error } = useUsers();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center gap-3 py-16 text-muted-foreground">
        <Spinner />
        <span className="text-sm">Loading members…</span>
      </div>
    );
  }

  if (error) {
    return <p className="py-12 text-center text-destructive">{error.message}</p>;
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {(data ?? []).map((u) => (
        <Link
          key={u.display_name}
          href={`/users/${encodeURIComponent(u.display_name)}`}
          className="group flex items-center gap-4 rounded-lg border border-border bg-card p-4 transition-colors hover:border-ring hover:bg-muted/30"
        >
          <Avatar name={u.display_name} size="lg" />
          <div className="min-w-0">
            <p className="font-semibold group-hover:underline">{u.display_name}</p>
            <p className="text-sm text-muted-foreground truncate">{u.name}</p>
            {u.github_username && (
              <a
                href={`https://github.com/${u.github_username}`}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="mt-1 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              >
                @{u.github_username}
                <ExternalLink className="h-2.5 w-2.5" />
              </a>
            )}
          </div>
        </Link>
      ))}
    </div>
  );
}
