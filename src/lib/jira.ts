import { JIRA_BASE_URL, JIRA_EMAIL, JIRA_PAT } from './config';

const FIELDS = 'summary,status,priority,customfield_10028,created,resolutiondate,issuetype';

const PERIOD_JQL: Record<string, string> = {
  '7d': '-7d',
  '30d': '-30d',
  '3m': '-13w',
  '6m': '-26w',
  '12m': '-52w',
};

function authHeader(): string {
  const token = Buffer.from(`${JIRA_EMAIL}:${JIRA_PAT}`).toString('base64');
  return `Basic ${token}`;
}

interface JiraIssue {
  key: string;
  fields: {
    summary: string;
    status: { name: string; statusCategory: { name: string } };
    issuetype: { name: string };
    customfield_10028: number | null;
    created: string;
    resolutiondate: string | null;
  };
}

async function runJiraQuery(jql: string): Promise<JiraIssue[]> {
  const url = `${JIRA_BASE_URL}/rest/api/3/search/jql`;
  const headers = { Authorization: authHeader(), Accept: 'application/json' };
  const issues: JiraIssue[] = [];
  let nextPageToken: string | undefined;

  for (let page = 0; page < 100; page++) {
    const params = new URLSearchParams({ jql, fields: FIELDS, maxResults: '100' });
    if (nextPageToken) params.set('nextPageToken', nextPageToken);

    const res = await fetch(`${url}?${params}`, { headers });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Jira API error ${res.status}: ${text.slice(0, 500)}`);
    }

    const data = await res.json();
    const batch: JiraIssue[] = data.issues ?? [];
    if (batch.length === 0) break;
    issues.push(...batch);
    nextPageToken = data.nextPageToken;
    if (!nextPageToken) break;
  }

  return issues;
}

export interface Ticket {
  key: string;
  summary: string;
  status: string;
  issue_type: string;
  story_points: number | null;
  created: string;
  completed: string | null;
}

function buildTicket(issue: JiraIssue): Ticket {
  const f = issue.fields;
  return {
    key: issue.key,
    summary: f.summary ?? '',
    status: f.status?.name ?? '',
    issue_type: f.issuetype?.name ?? '',
    story_points: f.customfield_10028 ?? null,
    created: f.created ?? '',
    completed: f.resolutiondate ?? null,
  };
}

function isDone(issue: JiraIssue): boolean {
  return issue.fields?.status?.statusCategory?.name === 'Done';
}

export interface UserJiraMetrics {
  user: string;
  display_name: string;
  period: string;
  jira_account_id: string | null;
  assigned: number;
  completed: number;
  active: number;
  tickets: Ticket[];
  error?: string;
}

async function fetchUserJiraMetrics(
  user: { name: string; display_name: string; jira_account_id: string | null },
  period: string,
  projects: string[],
): Promise<UserJiraMetrics> {
  const accountId = user.jira_account_id;
  if (!accountId) throw new Error(`No jira_account_id configured for ${user.display_name}`);

  const periodWindow = PERIOD_JQL[period] ?? '-30d';
  const projectStr = projects.join(', ');
  const jql = `assignee = "${accountId}" AND project IN (${projectStr}) AND created >= ${periodWindow}`;

  const issues = await runJiraQuery(jql);
  const tickets = issues.map(buildTicket);
  const doneKeys = new Set(issues.filter(isDone).map((i) => i.key));

  return {
    user: user.name,
    display_name: user.display_name,
    period,
    jira_account_id: accountId,
    assigned: tickets.length,
    completed: tickets.filter((t) => doneKeys.has(t.key)).length,
    active: tickets.filter((t) => !doneKeys.has(t.key)).length,
    tickets,
  };
}

export async function collectJiraMetrics(
  users: Array<{ name: string; display_name: string; jira_account_id: string | null }>,
  period: string,
  projects: string[],
): Promise<UserJiraMetrics[]> {
  const results: UserJiraMetrics[] = [];
  for (const user of users) {
    try {
      results.push(await fetchUserJiraMetrics(user, period, projects));
    } catch (err) {
      results.push({
        user: user.name,
        display_name: user.display_name,
        period,
        jira_account_id: null,
        assigned: 0,
        completed: 0,
        active: 0,
        tickets: [],
        error: String(err),
      });
    }
  }
  return results;
}
