import type { UserJiraMetrics } from './jira';
import type { UserGitHubMetrics } from './github';

export interface LeaderboardEntry {
  rank: number;
  name: string;
  display_name: string;
  jira_username: string;
  github_username: string;
  period: string;
  jira_assigned: number;
  jira_completed: number;
  jira_active: number;
  github_opened_prs: number;
  github_merged_prs: number;
  github_open_prs: number;
  total: number;
  jira_error?: string;
}

export function aggregate(jiraData: UserJiraMetrics[], githubData: UserGitHubMetrics[]): LeaderboardEntry[] {
  const githubByName = new Map(githubData.map((g) => [g.display_name, g]));

  const entries: LeaderboardEntry[] = jiraData.map((jira) => {
    const gh = githubByName.get(jira.display_name);
    const jiraCompleted = jira.completed;
    const githubMerged = gh?.merged_prs ?? 0;
    return {
      rank: 0,
      name: jira.user,
      display_name: jira.display_name,
      jira_username: jira.user,
      github_username: gh?.user ?? '',
      period: jira.period,
      jira_assigned: jira.assigned,
      jira_completed: jiraCompleted,
      jira_active: jira.active,
      github_opened_prs: gh?.opened_prs ?? 0,
      github_merged_prs: githubMerged,
      github_open_prs: gh?.open_prs ?? 0,
      total: jiraCompleted + githubMerged,
      jira_error:
        jira.error ??
        (jira.assigned === 0 && jira.completed === 0
          ? 'No Jira activity found — check jira_account_id mapping for this user'
          : undefined),
    };
  });

  entries.sort((a, b) => b.total - a.total);
  entries.forEach((e, i) => { e.rank = i + 1; });
  return entries;
}
