"use client";

import { useState, useMemo } from "react";
import { ExternalLink } from "lucide-react";
import { Badge, statusVariant } from "@/components/atoms/Badge";
import { Spinner } from "@/components/atoms/Spinner";
import { SearchBar } from "@/components/molecules/SearchBar";
import { PeriodSelector } from "@/components/molecules/PeriodSelector";
import { useTickets, useUsers } from "@/hooks/useLeaderboard";
import type { Period } from "@/types";

export function JiraTicketsTable() {
  const [period, setPeriod] = useState<Period>("30d");
  const [search, setSearch] = useState("");
  const [assignee, setAssignee] = useState("");
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 25;

  const { data, isLoading, error } = useTickets(period, assignee || undefined);
  const { data: users } = useUsers();

  const filtered = useMemo(() => {
    if (!data) return [];
    if (!search) return data.tickets;
    const q = search.toLowerCase();
    return data.tickets.filter(
      (t) =>
        t.key.toLowerCase().includes(q) ||
        t.summary.toLowerCase().includes(q) ||
        t.status.toLowerCase().includes(q)
    );
  }, [data, search]);

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
          <SearchBar value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder="Search tickets..." className="w-64" />
          <select
            value={assignee}
            onChange={(e) => { setAssignee(e.target.value); setPage(1); }}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="">All members</option>
            {users?.map((u) => (
              <option key={u.display_name} value={u.display_name}>{u.display_name}</option>
            ))}
          </select>
        </div>
        <PeriodSelector value={period} onChange={(p) => { setPeriod(p); setPage(1); }} />
      </div>

      <div className="rounded-lg border border-border bg-card overflow-hidden">
        {isLoading && (
          <div className="flex items-center justify-center gap-3 py-16 text-muted-foreground">
            <Spinner />
            <span className="text-sm">Loading tickets…</span>
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
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Key</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Summary</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Assignee</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Status</th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground">Points</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Created</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Completed</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {paged.length === 0 && (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-muted-foreground">No tickets found</td>
                  </tr>
                )}
                {paged.map((t) => (
                  <tr key={t.key} className="hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-3">
                      <a
                        href={`https://issues.redhat.com/browse/${t.key}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 font-mono text-xs text-blue-400 hover:underline"
                      >
                        {t.key}
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    </td>
                    <td className="px-4 py-3 max-w-xs">
                      <span className="line-clamp-1">{t.summary}</span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{t.assignee ?? "—"}</td>
                    <td className="px-4 py-3">
                      <Badge variant={statusVariant(t.status)}>{t.status}</Badge>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                      {t.story_points ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">{formatDate(t.created)}</td>
                    <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">{formatDate(t.completed)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {totalPages > 1 && (
              <div className="flex items-center justify-between border-t border-border px-4 py-3">
                <p className="text-xs text-muted-foreground">
                  {filtered.length} tickets · page {page} of {totalPages}
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="rounded border border-border px-3 py-1 text-xs disabled:opacity-40 hover:bg-muted"
                  >
                    Previous
                  </button>
                  <button
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages}
                    className="rounded border border-border px-3 py-1 text-xs disabled:opacity-40 hover:bg-muted"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
