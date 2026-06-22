import type {
  LeaderboardResponse,
  PRsResponse,
  Period,
  TicketsResponse,
  UserDetail,
  UserSummary,
} from "@/types";

async function apiFetch<T>(path: string, timeoutMs = 300_000): Promise<T> {
  const res = await fetch(path, {
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error ?? `API error: ${res.status}`);
  }
  return res.json();
}

export const api = {
  getLeaderboard: (period: Period): Promise<LeaderboardResponse> =>
    apiFetch(`/api/leaderboard?period=${period}`),

  getUsers: (): Promise<UserSummary[]> => apiFetch("/api/users"),

  getUser: (username: string, period: Period): Promise<UserDetail> =>
    apiFetch(`/api/users/${encodeURIComponent(username)}?period=${period}`),

  getTickets: (period: Period, assignee?: string): Promise<TicketsResponse> => {
    const params = new URLSearchParams({ period });
    if (assignee) params.set("assignee", assignee);
    return apiFetch(`/api/tickets?${params}`);
  },

  getPullRequests: (period: Period, user?: string): Promise<PRsResponse> => {
    const params = new URLSearchParams({ period });
    if (user) params.set("user", user);
    return apiFetch(`/api/pull-requests?${params}`);
  },

  refresh: (): Promise<{ message: string }> =>
    fetch("/api/refresh", { method: "POST" }).then((r) => r.json()),
};
