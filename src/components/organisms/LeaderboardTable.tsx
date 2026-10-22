"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { GitBranch, GitMerge, CheckCircle2, Clock, ListTodo, RefreshCw, Trophy, CircleSlash, AlertTriangle } from "lucide-react";
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

const CURRENT_USER_NAME = "Shehan Saleem";
const TARGET_RANK = 5;

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

  const { currentUserBehindTarget, pointsToTargetRank } = useMemo(() => {
    if (!data) return { currentUserBehindTarget: false, pointsToTargetRank: 0 };
    const me = data.users.find((u) => u.name === CURRENT_USER_NAME);
    const targetRankEntry = data.users.find((u) => u.rank === TARGET_RANK);
    if (!me || !targetRankEntry || me.rank <= TARGET_RANK) {
      return { currentUserBehindTarget: false, pointsToTargetRank: 0 };
    }
    // +1 ensures strictly overtaking the rank-6 total, even on a tie-break.
    const needed = Math.max(0, targetRankEntry.total - me.total) + 1;
    return { currentUserBehindTarget: true, pointsToTargetRank: needed };
  }, [data]);

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

      {currentUserBehindTarget && (
        <div className="flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>
            You&apos;re below rank #{TARGET_RANK} for this period — you need{" "}
            <span className="font-semibold">{pointsToTargetRank}</span> more point
            {pointsToTargetRank === 1 ? "" : "s"} to reach rank #{TARGET_RANK}.
          </span>
        </div>
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
              {rows.map((u) => {
                const hasJiraError = u.jira_assigned === 0 && u.jira_completed === 0;
                const isMe = u.name === CURRENT_USER_NAME;
                const isMeBehindTarget = isMe && currentUserBehindTarget;
                return (
                <tr
                  key={u.display_name}
                  className={`hover:bg-muted/50 transition-colors ${
                    isMeBehindTarget ? "bg-red-500/10" : isMe ? "bg-muted/40" : ""
                  } ${hasJiraError && !isMeBehindTarget ? "bg-red-500/5" : ""}`}
                >
                  <td
                    className={`px-4 py-3 tabular-nums text-sm ${
                      isMeBehindTarget ? "text-red-400 font-semibold" : "text-muted-foreground"
                    }`}
                  >
                    {u.rank}
                  </td>
                  <td className="px-4 py-3">
                    <Link
                      href={`/users/${encodeURIComponent(u.display_name)}`}
                      className="flex items-center gap-2 hover:underline"
                    >
                      <span
                        className={`font-medium flex-1 min-w-0 ${isMeBehindTarget ? "text-red-400" : ""}`}
                      >
                        {u.name}
                      </span>
                      <span className="flex items-center gap-1 shrink-0">
                        {isMeBehindTarget && (
                          <span title={`Below rank #${TARGET_RANK} — need ${pointsToTargetRank} more point${pointsToTargetRank === 1 ? "" : "s"}`}>
                            <AlertTriangle className="h-3.5 w-3.5 text-red-400" />
                          </span>
                        )}
                        {hasJiraError && (
                          <span title={u.jira_error ?? "0 assigned and 0 completed — likely a data/config error"}>
                            <AlertTriangle className="h-3.5 w-3.5 text-red-400" />
                          </span>
                        )}
                        {!u.github_username && (
                          <span title="GitHub username not configured">
                            <CircleSlash className="h-3 w-3 text-red-400" />
                          </span>
                        )}
                      </span>
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span
                      className={`flex items-center justify-end gap-1 tabular-nums ${
                        hasJiraError ? "text-red-400 font-semibold" : "text-muted-foreground"
                      }`}
                      title={hasJiraError ? u.jira_error : undefined}
                    >
                      <ListTodo className="h-3.5 w-3.5" />
                      {u.jira_assigned}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span
                      className={`flex items-center justify-end gap-1 tabular-nums font-semibold ${
                        hasJiraError ? "text-red-400" : "text-emerald-400"
                      }`}
                      title={hasJiraError ? u.jira_error : undefined}
                    >
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
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
