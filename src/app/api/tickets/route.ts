import type { NextRequest } from 'next/server';
import { getLeaderboard } from '@/lib/leaderboard';

export async function GET(req: NextRequest) {
  const period = req.nextUrl.searchParams.get('period') ?? '30d';
  const assignee = req.nextUrl.searchParams.get('assignee');
  try {
    const data = await getLeaderboard(period);
    const tickets = data.raw.jira.flatMap((u) => {
      if (assignee && u.display_name.toLowerCase() !== assignee.toLowerCase()) return [];
      return u.tickets.map((t) => ({ ...t, assignee: u.display_name }));
    });
    return Response.json({ period, total: tickets.length, tickets });
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 });
  }
}
