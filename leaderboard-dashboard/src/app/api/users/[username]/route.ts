import type { NextRequest } from 'next/server';
import { getLeaderboard } from '@/lib/leaderboard';

const VALID_PERIODS = new Set(['30d', '3m', '6m', '12m']);

export async function GET(req: NextRequest, ctx: RouteContext<'/api/users/[username]'>) {
  const { username } = await ctx.params;
  const period = req.nextUrl.searchParams.get('period') ?? '30d';
  if (!VALID_PERIODS.has(period)) {
    return Response.json(
      { error: `period must be one of: ${[...VALID_PERIODS].sort().join(', ')}` },
      { status: 400 },
    );
  }
  try {
    const data = await getLeaderboard(period);
    const lower = decodeURIComponent(username).toLowerCase();
    const match = data.users.find(
      (u) => u.display_name.toLowerCase() === lower || u.github_username.toLowerCase() === lower,
    );
    if (!match) {
      return Response.json({ error: `User '${username}' not found` }, { status: 404 });
    }
    const rawJira = data.raw.jira.find((r) => r.display_name === match.display_name);
    const rawGithub = data.raw.github.find((r) => r.display_name === match.display_name);
    return Response.json({
      ...match,
      tickets: rawJira?.tickets ?? [],
      pull_requests: rawGithub?.pull_requests ?? [],
    });
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 });
  }
}
