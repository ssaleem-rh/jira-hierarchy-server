import type { NextRequest } from 'next/server';
import { getLeaderboard } from '@/lib/leaderboard';

const VALID_PERIODS = new Set(['30d', '3m', '6m', '12m']);

export async function GET(req: NextRequest) {
  const period = req.nextUrl.searchParams.get('period') ?? '30d';
  if (!VALID_PERIODS.has(period)) {
    return Response.json(
      { error: `period must be one of: ${[...VALID_PERIODS].sort().join(', ')}` },
      { status: 400 },
    );
  }
  try {
    const data = await getLeaderboard(period);
    return Response.json({ period: data.period, generated_at: data.generated_at, users: data.users });
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 });
  }
}
