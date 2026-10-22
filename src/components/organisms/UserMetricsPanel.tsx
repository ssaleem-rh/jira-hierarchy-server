"use client";

import { useState } from "react";
import { ExternalLink, GitMerge, GitBranch, CheckCircle2, Clock, ListTodo, AlertTriangle } from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { Avatar } from "@/components/atoms/Avatar";
import { Badge, statusVariant, prStateVariant } from "@/components/atoms/Badge";
import { MetricCard } from "@/components/molecules/MetricCard";
import { PeriodSelector } from "@/components/molecules/PeriodSelector";
import { Spinner } from "@/components/atoms/Spinner";
import { useUser } from "@/hooks/useLeaderboard";
import type { Period } from "@/types";

function buildWeeklyData(tickets: { created: string; completed: string | null }[], prs: { created_at: string; state: string }[]) {
  const weeks: Record<string, { week: string; jira_done: number; prs_merged: number }> = {};

  function weekKey(iso: string) {
    const d = new Date(iso);
    d.setDate(d.getDate() - d.getDay());
    return d.toISOString().slice(0, 10);
  }

  for (const t of tickets) {
    if (!t.completed) continue;
    const k = weekKey(t.completed);
    weeks[k] ??= { week: k, jira_done: 0, prs_merged: 0 };
    weeks[k].jira_done++;
  }
  for (const pr of prs) {
    if (pr.state !== "MERGED") continue;
    const k = weekKey(pr.created_at);
    weeks[k] ??= { week: k, jira_done: 0, prs_merged: 0 };
    weeks[k].prs_merged++;
  }

  return Object.values(weeks).sort((a, b) => a.week.localeCompare(b.week)).slice(-12);
}

function formatDate(iso?: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

interface UserMetricsPanelProps {
  username: string;
}

export function UserMetricsPanel({ username }: UserMetricsPanelProps) {
  const [period, setPeriod] = useState<Period>("30d");
  const { data, isLoading, error } = useUser(username, period);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center gap-3 py-24 text-muted-foreground">
        <Spinner size="lg" />
        <span>Loading metrics…</span>
      </div>
    );
  }

  if (error) {
    return <p className="py-12 text-center text-destructive">{error.message}</p>;
  }

  if (!data) return null;

  const chartData = buildWeeklyData(data.tickets ?? [], data.pull_requests ?? []);
  const hasJiraError = data.jira_assigned === 0 && data.jira_completed === 0;

  return (
    <div className="flex flex-col gap-6">
      {hasJiraError && (
        <div className="flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>
            {data.jira_error ?? "0 assigned and 0 completed Jira tickets for this period — likely a data/config error (check jira_account_id mapping)."}
          </span>
        </div>
      )}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          <Avatar name={data.display_name} size="lg" />
          <div>
            <h1 className="text-2xl font-bold">{data.display_name}</h1>
            <div className="mt-1 flex items-center gap-3 text-sm text-muted-foreground">
              {data.github_username && (
                <a
                  href={`https://github.com/${data.github_username}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 hover:text-foreground"
                >
                  @{data.github_username}
                  <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </div>
          </div>
        </div>
        <PeriodSelector value={period} onChange={setPeriod} />
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <MetricCard
          label="Assigned"
          value={data.jira_assigned}
          accent={hasJiraError ? "text-red-400" : undefined}
          className={hasJiraError ? "border-red-500/40" : undefined}
        />
        <MetricCard
          label="Completed"
          value={data.jira_completed}
          accent={hasJiraError ? "text-red-400" : "text-emerald-400"}
          className={hasJiraError ? "border-red-500/40" : undefined}
        />
        <MetricCard label="Active" value={data.jira_active} accent="text-amber-400" />
        <MetricCard label="PRs Opened" value={data.github_opened_prs} />
        <MetricCard label="Merged PRs" value={data.github_merged_prs} accent="text-violet-400" />
        <MetricCard label="Open PRs" value={data.github_open_prs} accent="text-blue-400" />
      </div>

      {chartData.length > 0 && (
        <div className="rounded-lg border border-border bg-card p-4">
          <h2 className="mb-4 text-sm font-semibold text-muted-foreground uppercase tracking-wider">Weekly Activity</h2>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
              <defs>
                <linearGradient id="colorJira" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="colorPR" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="week" tick={{ fontSize: 10, fill: "#71717a" }} />
              <YAxis tick={{ fontSize: 10, fill: "#71717a" }} allowDecimals={false} />
              <Tooltip
                contentStyle={{ background: "#18181b", border: "1px solid #27272a", borderRadius: 8, fontSize: 12 }}
                labelStyle={{ color: "#a1a1aa" }}
              />
              <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
              <Area type="linear" dataKey="jira_done" name="Jira Completed" stroke="#10b981" fill="url(#colorJira)" strokeWidth={2} />
              <Area type="linear" dataKey="prs_merged" name="PRs Merged" stroke="#8b5cf6" fill="url(#colorPR)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-lg border border-border bg-card">
          <h2 className="border-b border-border px-4 py-3 text-sm font-semibold">Recent Tickets</h2>
          {(data.tickets ?? []).length === 0 ? (
            <p className="px-4 py-6 text-sm text-muted-foreground">No tickets in this period</p>
          ) : (
            <ul className="divide-y divide-border">
              {(data.tickets ?? []).slice(0, 10).map((t) => (
                <li key={t.key} className="flex items-start justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <a
                      href={`https://issues.redhat.com/browse/${t.key}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 font-mono text-xs text-blue-400 hover:underline"
                    >
                      {t.key}
                      <ExternalLink className="h-2.5 w-2.5" />
                    </a>
                    <p className="mt-0.5 truncate text-sm">{t.summary}</p>
                  </div>
                  <Badge variant={statusVariant(t.status)} className="shrink-0">{t.status}</Badge>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-lg border border-border bg-card">
          <h2 className="border-b border-border px-4 py-3 text-sm font-semibold">Recent Pull Requests</h2>
          {(data.pull_requests ?? []).length === 0 ? (
            <p className="px-4 py-6 text-sm text-muted-foreground">No pull requests in this period</p>
          ) : (
            <ul className="divide-y divide-border">
              {(data.pull_requests ?? []).slice(0, 10).map((pr) => (
                <li key={`${pr.repository}-${pr.number}`} className="flex items-start justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <p className="font-mono text-xs text-muted-foreground">{pr.repository} #{pr.number}</p>
                    <a
                      href={pr.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-0.5 flex items-center gap-1 truncate text-sm hover:underline"
                    >
                      {pr.title}
                      <ExternalLink className="h-2.5 w-2.5 shrink-0 text-muted-foreground" />
                    </a>
                  </div>
                  <Badge variant={prStateVariant(pr.state)} className="shrink-0">{pr.state}</Badge>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
