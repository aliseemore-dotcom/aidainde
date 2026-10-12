import { createHmac, randomBytes } from 'node:crypto';
import { ApiError } from './errors';

/** Непрозрачный токен результатов: 24 случайных байта. В БД хранится только HMAC-хэш. */
export const newToken = (): string => randomBytes(24).toString('base64url');
export const hashToken = (token: string, secret: string): string => createHmac('sha256', secret).update(token).digest('hex');
export const looksLikeToken = (t: string): boolean => /^[A-Za-z0-9_-]{32}$/.test(t);

const buckets = new Map<string, number[]>();

/**
 * Скользящее окно в памяти процесса. На serverless (Vercel) каждый инстанс считает отдельно, поэтому это
 * защита от случайных всплесков, а не от распределённой атаки: для неё нужен общий стор (Upstash/Redis).
 */
export function rateLimit(key: string, limit: number, windowMs: number, now = Date.now()): void {
  const hits = (buckets.get(key) ?? []).filter((t) => now - t < windowMs);
  if (hits.length >= limit) {
    const retry = Math.max(1, Math.ceil((windowMs - (now - hits[0]!)) / 1000));
    throw new ApiError('RATE_LIMITED', 'Слишком много запросов. Попробуйте чуть позже.', undefined, { 'retry-after': String(retry) });
  }
  hits.push(now);
  buckets.set(key, hits);
  if (buckets.size > 5000) for (const [k, v] of buckets) if (!v.some((t) => now - t < windowMs)) buckets.delete(k);
}

export function clientIp(req: Request): string {
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || 'unknown';
}

export const resetRateLimits = () => buckets.clear();

/** Разрешён ли хост картинки (список IMAGE_HOSTS); только https. */
export function isAllowedImageUrl(url: string, hosts: string[]): boolean {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && hosts.includes(u.hostname.toLowerCase());
  } catch { return false; }
}

/**
 * Защита от CSRF для изменяющих запросов с cookie-сессией: нужен JSON и совпадающее происхождение.
 * Если заголовка Origin нет (не браузер), cookie-сессии всё равно не будет, и авторизация не пройдёт.
 */
export function assertSameOrigin(req: Request, opts: { json?: boolean } = {}): void {
  const origin = req.headers.get('origin');
  if (origin) {
    const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host') ?? new URL(req.url).host;
    let ok = false;
    try { ok = new URL(origin).host === host; } catch { ok = false; }
    if (!ok) throw new ApiError('FORBIDDEN', 'Запрос с чужого сайта отклонён');
  }
  if (opts.json !== false && !(req.headers.get('content-type') ?? '').includes('application/json')) {
    throw new ApiError('INVALID_CONTENT', 'Ожидается application/json');
  }
}
