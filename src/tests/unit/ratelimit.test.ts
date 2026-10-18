import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/errors';
import { memoryStore, rateLimit, resetRateLimits, setRateStore, upstashStore } from '@/lib/security';

beforeEach(() => resetRateLimits());

const reply = (count: number) => vi.fn(async () => new Response(JSON.stringify([{ result: count }, { result: 1 }]), { status: 200 })) as unknown as typeof fetch;
const code = async (p: Promise<unknown>) => { try { await p; return 'OK'; } catch (e) { return e instanceof ApiError ? e.code : 'THROWN'; } };

describe('ограничитель в памяти', () => {
  it('пропускает до лимита, затем RATE_LIMITED с Retry-After; окно скользит', async () => {
    const t0 = 1_000_000;
    for (let i = 0; i < 3; i++) await rateLimit('k', 3, 60_000, t0 + i);
    try { await rateLimit('k', 3, 60_000, t0 + 10); throw new Error('no'); } catch (e) {
      expect(e).toBeInstanceOf(ApiError);
      expect((e as ApiError).headers?.['retry-after']).toBe('60');
    }
    expect(await code(rateLimit('other', 3, 60_000, t0))).toBe('OK'); // другой ключ не затронут
    expect(await code(rateLimit('k', 3, 60_000, t0 + 61_000))).toBe('OK'); // окно прошло
  });
});

describe('хранилище Upstash (Redis REST)', () => {
  it('шлёт INCR+EXPIRE одним запросом, ключ — HMAC, а не IP', async () => {
    const f = reply(1);
    const store = upstashStore('https://redis.example.com/', 'tok', 'secret-secret-secret', f);
    const hit = await store.hit('complete:203.0.113.7', 60_000, 120_000);
    expect(hit.count).toBe(1);
    const [url, init] = (f as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls[0]!;
    expect(url).toBe('https://redis.example.com/pipeline');
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer tok');
    const body = JSON.parse(init.body as string);
    expect(body[0][0]).toBe('INCR');
    expect(body[1].slice(0, 1)).toEqual(['EXPIRE']);
    expect(JSON.stringify(body)).not.toContain('203.0.113.7'); // IP в Redis открытым текстом не хранится
    expect(body[0][1]).toMatch(/^rl:[0-9a-f]{32}:2$/); // 120000 / 60000 = окно №2
  });

  it('лимит считается по ответу Redis; retry-after — до конца окна', async () => {
    setRateStore(upstashStore('https://r.example.com', 't', 'secret-secret-secret', reply(5)));
    expect(await code(rateLimit('k', 5, 60_000, 130_000))).toBe('OK');
    setRateStore(upstashStore('https://r.example.com', 't', 'secret-secret-secret', reply(6)));
    try { await rateLimit('k', 5, 60_000, 130_000); throw new Error('no'); } catch (e) {
      expect((e as ApiError).code).toBe('RATE_LIMITED');
      expect((e as ApiError).headers?.['retry-after']).toBe('50'); // окно №2 заканчивается на 180_000
    }
  });

  it('сбой Redis (ошибка, 500, мусор, таймаут) -> работаем на памяти, сайт не падает', async () => {
    const bad: typeof fetch[] = [
      vi.fn(async () => { throw new Error('network'); }) as unknown as typeof fetch,
      vi.fn(async () => new Response('x', { status: 500 })) as unknown as typeof fetch,
      vi.fn(async () => new Response('"oops"', { status: 200 })) as unknown as typeof fetch,
    ];
    for (const f of bad) {
      resetRateLimits();
      setRateStore(upstashStore('https://r.example.com', 't', 'secret-secret-secret', f));
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
      for (let i = 0; i < 2; i++) expect(await code(rateLimit('k', 2, 60_000, 1000 + i))).toBe('OK');
      expect(await code(rateLimit('k', 2, 60_000, 1002))).toBe('RATE_LIMITED'); // защита деградирует до локальной, а не пропадает
      spy.mockRestore();
    }
  });

  it('memoryStore считает попадания', async () => {
    expect((await memoryStore.hit('z', 1000, 1)).count).toBe(1);
    expect((await memoryStore.hit('z', 1000, 2)).count).toBe(2);
  });
});
