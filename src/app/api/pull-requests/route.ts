import type { NextRequest } from 'next/server';
import { getLeaderboard } from '@/lib/leaderboard';

export async function GET(req: NextRequest) {
  const period = req.nextUrl.searchParams.get('period') ?? '30d';
  const user = req.nextUrl.searchParams.get('user');
  try {
    const data = await getLeaderboard(period);
    const prs = data.raw.github.flatMap((u) => {
      if (user && u.display_name.toLowerCase() !== user.toLowerCase()) return [];
      return u.pull_requests.map((pr) => ({ ...pr, author: u.display_name }));
    });
    return Response.json({ period, total: prs.length, pull_requests: prs });
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 });
  }
}
