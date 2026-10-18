import { createHmac, randomBytes } from 'node:crypto';
import { ApiError } from './errors';
import { readEnv, tokenSecret } from './env';

/** Непрозрачный токен результатов: 24 случайных байта. В БД хранится только HMAC-хэш. */
export const newToken = (): string => randomBytes(24).toString('base64url');
export const hashToken = (token: string, secret: string): string => createHmac('sha256', secret).update(token).digest('hex');
export const looksLikeToken = (t: string): boolean => /^[A-Za-z0-9_-]{32}$/.test(t);

/**
 * Ограничитель запросов с подключаемым хранилищем.
 *  - без настроек: окно в памяти процесса (защита от случайных всплесков; на serverless каждый инстанс считает свой);
 *  - с UPSTASH_REDIS_REST_URL/TOKEN: общий счётчик в Redis (фиксированное окно), ключи — HMAC от идентификатора клиента,
 *    чтобы IP не лежали в Redis открытым текстом.
 * Сбой Redis никогда не ломает сайт: переходим на счётчик в памяти.
 */
export interface RateHit { count: number; retryAfterSec: number }
export interface RateStore { hit(key: string, windowMs: number, now: number): Promise<RateHit> }

const buckets = new Map<string, number[]>();

export const memoryStore: RateStore = {
  async hit(key, windowMs, now) {
    const hits = (buckets.get(key) ?? []).filter((t) => now - t < windowMs);
    hits.push(now);
    buckets.set(key, hits);
    if (buckets.size > 5000) for (const [k, v] of buckets) if (!v.some((t) => now - t < windowMs)) buckets.delete(k);
    return { count: hits.length, retryAfterSec: Math.max(1, Math.ceil((windowMs - (now - hits[0]!)) / 1000)) };
  },
};

export function upstashStore(url: string, token: string, secret: string, fetchImpl: typeof fetch = fetch): RateStore {
  return {
    async hit(key, windowMs, now) {
      const windowId = Math.floor(now / windowMs);
      const redisKey = `rl:${createHmac('sha256', secret).update(key).digest('hex').slice(0, 32)}:${windowId}`;
      const ttl = Math.ceil(windowMs / 1000) + 1;
      const res = await fetchImpl(`${url.replace(/\/$/, '')}/pipeline`, {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify([['INCR', redisKey], ['EXPIRE', redisKey, String(ttl), 'NX']]),
        signal: AbortSignal.timeout(1500),
      });
      if (!res.ok) throw new Error(`upstash ${res.status}`);
      const out = (await res.json()) as { result?: unknown }[];
      const count = Number(out?.[0]?.result);
      if (!Number.isFinite(count)) throw new Error('upstash: unexpected reply');
      return { count, retryAfterSec: Math.max(1, Math.ceil(((windowId + 1) * windowMs - now) / 1000)) };
    },
  };
}

let activeStore: RateStore | null = null;
export const setRateStore = (s: RateStore | null) => { activeStore = s; };

function store(): RateStore {
  if (activeStore) return activeStore;
  const env = readEnv();
  if (env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN) {
    activeStore = upstashStore(env.UPSTASH_REDIS_REST_URL, env.UPSTASH_REDIS_REST_TOKEN, tokenSecret(env));
  } else {
    activeStore = memoryStore;
  }
  return activeStore;
}

export async function rateLimit(key: string, limit: number, windowMs: number, now = Date.now()): Promise<void> {
  let hit: RateHit;
  try {
    hit = await store().hit(key, windowMs, now);
  } catch (e) {
    console.error('[ratelimit] store failed, using memory', e instanceof Error ? e.message : 'unknown');
    hit = await memoryStore.hit(key, windowMs, now);
  }
  if (hit.count > limit) {
    throw new ApiError('RATE_LIMITED', 'Слишком много запросов. Попробуйте чуть позже.', undefined, { 'retry-after': String(hit.retryAfterSec) });
  }
}

export function clientIp(req: Request): string {
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || 'unknown';
}

export const resetRateLimits = () => { buckets.clear(); activeStore = null; };

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
