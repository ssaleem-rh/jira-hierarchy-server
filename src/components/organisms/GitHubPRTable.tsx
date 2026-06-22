"use client";

import { useState, useMemo } from "react";
import { ExternalLink } from "lucide-react";
import { Badge, prStateVariant } from "@/components/atoms/Badge";
import { Spinner } from "@/components/atoms/Spinner";
import { SearchBar } from "@/components/molecules/SearchBar";
import { PeriodSelector } from "@/components/molecules/PeriodSelector";
import { usePullRequests, useUsers } from "@/hooks/useLeaderboard";
import type { Period } from "@/types";

export function GitHubPRTable() {
  const [period, setPeriod] = useState<Period>("30d");
  const [search, setSearch] = useState("");
  const [user, setUser] = useState("");
  const [stateFilter, setStateFilter] = useState("");
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 25;

  const { data, isLoading, error } = usePullRequests(period, user || undefined);
  const { data: users } = useUsers();

  const filtered = useMemo(() => {
    if (!data) return [];
    return data.pull_requests.filter((pr) => {
      const q = search.toLowerCase();
      const matchSearch =
        !search ||
        pr.title.toLowerCase().includes(q) ||
        pr.repository.toLowerCase().includes(q) ||
        String(pr.number).includes(q);
      const matchState = !stateFilter || pr.state === stateFilter;
      return matchSearch && matchState;
    });
  }, [data, search, stateFilter]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  function formatDate(iso?: string | null) {
    if (!iso) return "—";
    return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <SearchBar value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder="Search PRs..." className="w-64" />
          <select
            value={user}
            onChange={(e) => { setUser(e.target.value); setPage(1); }}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="">All authors</option>
            {users?.map((u) => (
              <option key={u.display_name} value={u.display_name}>{u.display_name}</option>
            ))}
          </select>
          <select
            value={stateFilter}
            onChange={(e) => { setStateFilter(e.target.value); setPage(1); }}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="">All states</option>
            <option value="OPEN">Open</option>
            <option value="MERGED">Merged</option>
            <option value="CLOSED">Closed</option>
          </select>
        </div>
        <PeriodSelector value={period} onChange={(p) => { setPeriod(p); setPage(1); }} />
      </div>

      <div className="rounded-lg border border-border bg-card overflow-hidden">
        {isLoading && (
          <div className="flex items-center justify-center gap-3 py-16 text-muted-foreground">
            <Spinner />
            <span className="text-sm">Loading pull requests…</span>
          </div>
        )}
        {error && (
          <div className="py-12 text-center text-sm text-destructive">Error: {error.message}</div>
        )}
        {!isLoading && !error && (
          <>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">#</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Title</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Author</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Repository</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">State</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Opened</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Merged</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {paged.length === 0 && (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-muted-foreground">No pull requests found</td>
                  </tr>
                )}
                {paged.map((pr) => (
                  <tr key={`${pr.repository}-${pr.number}`} className="hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground">#{pr.number}</td>
                    <td className="px-4 py-3 max-w-xs">
                      <a
                        href={pr.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 hover:underline text-foreground"
                      >
                        <span className="line-clamp-1">{pr.title}</span>
                        <ExternalLink className="h-3 w-3 shrink-0 text-muted-foreground" />
                      </a>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{pr.author ?? "—"}</td>
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{pr.repository}</td>
                    <td className="px-4 py-3">
                      <Badge variant={prStateVariant(pr.state)}>{pr.state}</Badge>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">{formatDate(pr.created_at)}</td>
                    <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">{formatDate(pr.merged_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {totalPages > 1 && (
              <div className="flex items-center justify-between border-t border-border px-4 py-3">
                <p className="text-xs text-muted-foreground">
                  {filtered.length} pull requests · page {page} of {totalPages}
                </p>
                <div className="flex gap-2">
                  <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} className="rounded border border-border px-3 py-1 text-xs disabled:opacity-40 hover:bg-muted">Previous</button>
                  <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="rounded border border-border px-3 py-1 text-xs disabled:opacity-40 hover:bg-muted">Next</button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
