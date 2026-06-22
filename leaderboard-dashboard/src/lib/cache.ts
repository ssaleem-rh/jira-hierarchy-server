import fs from 'fs';
import path from 'path';
import { CACHE_TTL_MS } from './config';

const CACHE_DIR = path.join(process.cwd(), 'data');

function cachePath(key: string): string {
  return path.join(CACHE_DIR, `${key}.json`);
}

export function cacheGet<T>(key: string): T | null {
  const p = cachePath(key);
  if (!fs.existsSync(p)) return null;
  const stat = fs.statSync(p);
  if (Date.now() - stat.mtimeMs > CACHE_TTL_MS) return null;
  return JSON.parse(fs.readFileSync(p, 'utf-8')) as T;
}

export function cacheSet(key: string, data: unknown): void {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  fs.writeFileSync(cachePath(key), JSON.stringify(data, null, 2));
}

export function cacheInvalidate(key: string): void {
  const p = cachePath(key);
  if (fs.existsSync(p)) fs.unlinkSync(p);
}

export function cacheInvalidateAll(): void {
  if (!fs.existsSync(CACHE_DIR)) return;
  for (const f of fs.readdirSync(CACHE_DIR)) {
    if (f.endsWith('.json')) fs.unlinkSync(path.join(CACHE_DIR, f));
  }
}
