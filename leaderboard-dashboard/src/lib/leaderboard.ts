import { cacheGet, cacheSet } from './cache';
import { GITHUB_TOKEN } from './config';
import { collectJiraMetrics } from './jira';
import { collectGitHubMetrics } from './github';
import { aggregate } from './aggregator';
import { loadUsers } from './users';
import type { UserJiraMetrics } from './jira';
import type { UserGitHubMetrics } from './github';
import type { LeaderboardEntry } from './aggregator';

export interface LeaderboardData {
  period: string;
  generated_at: string;
  users: LeaderboardEntry[];
  raw: {
    jira: UserJiraMetrics[];
    github: UserGitHubMetrics[];
  };
}

// Prevent duplicate concurrent fetches for the same period
const inFlight = new Map<string, Promise<LeaderboardData>>();

export async function getLeaderboard(period: string): Promise<LeaderboardData> {
  const cacheKey = `leaderboard_${period}`;

  const cached = cacheGet<LeaderboardData>(cacheKey);
  if (cached) return cached;

  const existing = inFlight.get(cacheKey);
  if (existing) return existing;

  const promise = (async () => {
    try {
      const { users, jira_projects } = loadUsers();
      const [jiraData, githubData] = await Promise.all([
        collectJiraMetrics(users, period, jira_projects),
        collectGitHubMetrics(users, period, GITHUB_TOKEN || undefined),
      ]);
      const data: LeaderboardData = {
        period,
        generated_at: new Date().toISOString(),
        users: aggregate(jiraData, githubData),
        raw: { jira: jiraData, github: githubData },
      };
      cacheSet(cacheKey, data);
      return data;
    } finally {
      inFlight.delete(cacheKey);
    }
  })();

  inFlight.set(cacheKey, promise);
  return promise;
}
