import { GITHUB_TOKEN } from './config';

const GRAPHQL_QUERY = `
query($query: String!, $cursor: String) {
  search(query: $query, type: ISSUE, first: 100, after: $cursor) {
    pageInfo { hasNextPage endCursor }
    nodes {
      ... on PullRequest {
        number title url state createdAt mergedAt
        repository { nameWithOwner }
      }
    }
  }
}
`;

const PERIOD_DAYS: Record<string, number> = {
  '7d': 7,
  '30d': 30,
  '3m': 91,
  '6m': 183,
  '12m': 365,
};

function sinceDate(period: string): string {
  const days = PERIOD_DAYS[period] ?? 30;
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().split('T')[0];
}

function githubHeaders(token?: string): Record<string, string> {
  const tok = token ?? GITHUB_TOKEN;
  const h: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
  if (tok) h.Authorization = `Bearer ${tok}`;
  return h;
}

interface RawPR {
  number: number;
  title: string;
  url: string;
  state: string;
  createdAt: string;
  mergedAt: string | null;
  repository: { nameWithOwner: string };
}

async function fetchPRsGraphQL(username: string, since: string, token: string): Promise<RawPR[]> {
  const searchQuery = `author:${username} is:pr created:>=${since}`;
  const prs: RawPR[] = [];
  let cursor: string | null = null;

  while (true) {
    const res: Response = await fetch('https://api.github.com/graphql', {
      method: 'POST',
      headers: { ...githubHeaders(token), 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: GRAPHQL_QUERY, variables: { query: searchQuery, cursor } }),
    });
    if (!res.ok) throw new Error(`GitHub GraphQL ${res.status}`);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any = await res.json();
    if (data.errors) throw new Error(`GraphQL errors: ${JSON.stringify(data.errors)}`);

    const search = data.data.search;
    prs.push(...search.nodes);
    if (!search.pageInfo.hasNextPage) break;
    cursor = search.pageInfo.endCursor;
  }

  return prs;
}

async function fetchPRsRest(username: string, since: string, token?: string): Promise<RawPR[]> {
  const q = `author:${username} is:pr created:>=${since}`;
  const prs: RawPR[] = [];
  let page = 1;

  while (true) {
    const params = new URLSearchParams({ q, per_page: '100', page: String(page), sort: 'created', order: 'desc' });
    const res = await fetch(`https://api.github.com/search/issues?${params}`, {
      headers: githubHeaders(token),
    });
    if (!res.ok) throw new Error(`GitHub REST ${res.status}`);
    const data = await res.json();
    const items: Array<{
      number: number;
      title: string;
      html_url: string;
      state: string;
      created_at: string;
      pull_request?: { merged_at: string | null };
      repository_url: string;
    }> = data.items ?? [];

    for (const item of items) {
      const mergedAt = item.pull_request?.merged_at ?? null;
      prs.push({
        number: item.number,
        title: item.title,
        url: item.html_url,
        state: mergedAt ? 'MERGED' : item.state.toUpperCase(),
        createdAt: item.created_at,
        mergedAt,
        repository: { nameWithOwner: item.repository_url.split('/repos/')[1] ?? '' },
      });
    }

    const total: number = data.total_count ?? 0;
    if (items.length < 100 || page * 100 >= Math.min(total, 1000)) break;
    page++;
  }

  return prs;
}

export interface PullRequest {
  number: number;
  title: string;
  url: string;
  state: 'OPEN' | 'MERGED' | 'CLOSED';
  created_at: string;
  merged_at: string | null;
  repository: string;
}

function normalize(prs: RawPR[]): PullRequest[] {
  return prs.map((pr) => ({
    number: pr.number,
    title: pr.title,
    url: pr.url ?? '',
    state: pr.state.toUpperCase() as 'OPEN' | 'MERGED' | 'CLOSED',
    created_at: pr.createdAt ?? '',
    merged_at: pr.mergedAt ?? null,
    repository: pr.repository?.nameWithOwner ?? '',
  }));
}

export interface UserGitHubMetrics {
  user: string;
  display_name: string;
  period: string;
  opened_prs: number;
  merged_prs: number;
  open_prs: number;
  pull_requests: PullRequest[];
  error?: string;
}

async function fetchUserGitHubMetrics(
  user: { display_name: string; github_username: string },
  period: string,
  token?: string,
): Promise<UserGitHubMetrics> {
  const { github_username: username } = user;
  const since = sinceDate(period);
  const tok = token ?? GITHUB_TOKEN;

  let raw: RawPR[];
  try {
    raw = tok ? await fetchPRsGraphQL(username, since, tok) : await fetchPRsRest(username, since);
  } catch {
    raw = await fetchPRsRest(username, since, tok || undefined);
  }

  const prs = normalize(raw);
  return {
    user: username,
    display_name: user.display_name,
    period,
    opened_prs: prs.length,
    merged_prs: prs.filter((p) => p.state === 'MERGED').length,
    open_prs: prs.filter((p) => p.state === 'OPEN').length,
    pull_requests: prs,
  };
}

export async function collectGitHubMetrics(
  users: Array<{ display_name: string; github_username: string | null }>,
  period: string,
  token?: string,
): Promise<UserGitHubMetrics[]> {
  const results: UserGitHubMetrics[] = [];
  for (const user of users) {
    if (!user.github_username) {
      results.push({ user: '', display_name: user.display_name, period, opened_prs: 0, merged_prs: 0, open_prs: 0, pull_requests: [] });
      continue;
    }
    try {
      results.push(await fetchUserGitHubMetrics({ ...user, github_username: user.github_username }, period, token));
    } catch (err) {
      results.push({
        user: user.github_username,
        display_name: user.display_name,
        period,
        opened_prs: 0,
        merged_prs: 0,
        open_prs: 0,
        pull_requests: [],
        error: String(err),
      });
    }
  }
  return results;
}
