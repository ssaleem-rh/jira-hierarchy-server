import { cacheInvalidateAll } from '@/lib/cache';

export function POST() {
  cacheInvalidateAll();
  return Response.json({ message: 'Cache cleared' });
}
