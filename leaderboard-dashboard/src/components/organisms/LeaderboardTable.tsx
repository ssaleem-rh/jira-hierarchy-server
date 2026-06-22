"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { GitBranch, GitMerge, CheckCircle2, Clock, ListTodo, RefreshCw, Trophy, CircleSlash } from "lucide-react";
import { Spinner } from "@/components/atoms/Spinner";
import { SearchBar } from "@/components/molecules/SearchBar";
import { PeriodSelector } from "@/components/molecules/PeriodSelector";
import { SortableHeader } from "@/components/molecules/SortableHeader";
import { useLeaderboard, useRefresh } from "@/hooks/useLeaderboard";
import type { LeaderboardEntry, Period, SortDirection } from "@/types";

type SortKey = keyof Pick<
  LeaderboardEntry,
  | "rank"
  | "jira_assigned"
  | "jira_completed"
  | "jira_active"
  | "github_merged_prs"
  | "github_open_prs"
  | "total"
>;

function sortEntries(entries: LeaderboardEntry[], key: SortKey, dir: SortDirection) {
  return [...entries].sort((a, b) => {
    const diff = (a[key] as number) - (b[key] as number);
    return dir === "asc" ? diff : -diff;
  });
}

export function LeaderboardTable() {
  const [period, setPeriod] = useState<Period>("30d");
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("total");
  const [sortDir, setSortDir] = useState<SortDirection>("desc");

  const { data, isLoading, error } = useLeaderboard(period);
  const refresh = useRefresh();

  function handleSort(key: string) {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key as SortKey);
      setSortDir("desc");
    }
  }

  const rows = useMemo(() => {
    if (!data) return [];
    const filtered = search
      ? data.users.filter((u) =>
          u.name.toLowerCase().includes(search.toLowerCase()) ||
          u.display_name.toLowerCase().includes(search.toLowerCase())
        )
      : data.users;
    return sortEntries(filtered, sortKey, sortDir);
  }, [data, search, sortKey, sortDir]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SearchBar value={search} onChange={setSearch} placeholder="Search member..." className="w-56" />
        <div className="flex items-center gap-3">
          <PeriodSelector value={period} onChange={setPeriod} />
          <button
            onClick={() => refresh.mutate()}
            disabled={refresh.isPending}
            className="flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refresh.isPending ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>
      </div>

      {data?.generated_at && (
        <p className="text-xs text-muted-foreground">
          Last updated: {new Date(data.generated_at).toLocaleString()}
        </p>
      )}

      <div className="rounded-lg border border-border bg-card overflow-hidden">
        {isLoading && (
          <div className="flex items-center justify-center gap-3 py-16 text-muted-foreground">
            <Spinner />
            <span className="text-sm">Fetching metrics… this may take a minute on first load.</span>
          </div>
        )}
        {error && (
          <div className="py-12 text-center text-sm text-destructive">Error: {error.message}</div>
        )}
        {!isLoading && !error && (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                <th className="px-4 py-3 text-left w-16">
                  <SortableHeader label="Rank" sortKey="rank" currentKey={sortKey} direction={sortDir} onSort={handleSort} />
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Member</th>
                <th className="px-4 py-3 text-right">
                  <SortableHeader label="Assigned" sortKey="jira_assigned" currentKey={sortKey} direction={sortDir} onSort={handleSort} className="justify-end" />
                </th>
                <th className="px-4 py-3 text-right">
                  <SortableHeader label="Completed" sortKey="jira_completed" currentKey={sortKey} direction={sortDir} onSort={handleSort} className="justify-end" />
                </th>
                <th className="px-4 py-3 text-right">
                  <SortableHeader label="Active" sortKey="jira_active" currentKey={sortKey} direction={sortDir} onSort={handleSort} className="justify-end" />
                </th>
                <th className="px-4 py-3 text-right">
                  <SortableHeader label="Merged PRs" sortKey="github_merged_prs" currentKey={sortKey} direction={sortDir} onSort={handleSort} className="justify-end" />
                </th>
                <th className="px-4 py-3 text-right">
                  <SortableHeader label="Open PRs" sortKey="github_open_prs" currentKey={sortKey} direction={sortDir} onSort={handleSort} className="justify-end" />
                </th>
                <th className="px-4 py-3 text-right">
                  <SortableHeader label="Total" sortKey="total" currentKey={sortKey} direction={sortDir} onSort={handleSort} className="justify-end" />
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-muted-foreground">No results found</td>
                </tr>
              )}
              {rows.map((u) => (
                <tr key={u.display_name} className="hover:bg-muted/20 transition-colors">
                  <td className="px-4 py-3 tabular-nums text-muted-foreground text-sm">
                    {u.rank}
                  </td>
                  <td className="px-4 py-3">
                    <Link
                      href={`/users/${encodeURIComponent(u.display_name)}`}
                      className="flex items-center gap-2 hover:underline"
                    >
                      <span className="font-medium">{u.name}</span>
                      {!u.github_username && (
                        <span title="GitHub username not configured" className="shrink-0">
                          <CircleSlash className="h-3 w-3 text-muted-foreground/40" />
                        </span>
                      )}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className="flex items-center justify-end gap-1 tabular-nums text-muted-foreground">
                      <ListTodo className="h-3.5 w-3.5" />
                      {u.jira_assigned}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className="flex items-center justify-end gap-1 tabular-nums text-emerald-400 font-semibold">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      {u.jira_completed}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className="flex items-center justify-end gap-1 tabular-nums text-amber-400">
                      <Clock className="h-3.5 w-3.5" />
                      {u.jira_active}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className="flex items-center justify-end gap-1 tabular-nums text-violet-400 font-semibold">
                      <GitMerge className="h-3.5 w-3.5" />
                      {u.github_merged_prs}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className="flex items-center justify-end gap-1 tabular-nums text-blue-400">
                      <GitBranch className="h-3.5 w-3.5" />
                      {u.github_open_prs}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className="flex items-center justify-end gap-1 tabular-nums font-bold text-foreground">
                      <Trophy className="h-3.5 w-3.5 text-muted-foreground" />
                      {u.total}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
