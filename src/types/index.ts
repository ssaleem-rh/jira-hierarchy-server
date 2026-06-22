export type Period = "30d" | "3m" | "6m" | "12m";

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
}

export interface LeaderboardResponse {
  period: string;
  generated_at: string;
  users: LeaderboardEntry[];
}

export interface Ticket {
  key: string;
  summary: string;
  status: string;
  issue_type: string;
  story_points: number | null;
  created: string;
  completed: string | null;
  assignee?: string;
}

export interface TicketsResponse {
  period: string;
  total: number;
  tickets: Ticket[];
}

export interface PullRequest {
  number: number;
  title: string;
  url: string;
  state: "OPEN" | "MERGED" | "CLOSED";
  created_at: string;
  merged_at: string | null;
  repository: string;
  author?: string;
}

export interface PRsResponse {
  period: string;
  total: number;
  pull_requests: PullRequest[];
}

export interface UserSummary {
  display_name: string;
  name: string;
  github_username: string;
}

export interface UserDetail extends LeaderboardEntry {
  tickets: Ticket[];
  pull_requests: PullRequest[];
}

export type SortDirection = "asc" | "desc";

export interface SortState<T extends string> {
  key: T;
  direction: SortDirection;
}
