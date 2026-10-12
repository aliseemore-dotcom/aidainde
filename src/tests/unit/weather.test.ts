import { beforeEach, describe, expect, it, vi } from 'vitest';
import { classifyDay, loadForecast, parseForecast, resetWeatherCache, summarizeRange, weatherFor, type DayForecast } from '@/lib/weather';

const day = (o: Partial<DayForecast> = {}): DayForecast => ({ date: '2026-10-17', code: 1, tMax: 12, tMin: 5, precipProb: 10, gust: 5, ...o });
const NOW = new Date('2026-10-12T09:00:00Z');
beforeEach(() => resetWeatherCache());

const body = (days: DayForecast[]) => ({
  daily: {
    time: days.map((d) => d.date), weather_code: days.map((d) => d.code), temperature_2m_max: days.map((d) => d.tMax),
    temperature_2m_min: days.map((d) => d.tMin), precipitation_probability_max: days.map((d) => d.precipProb), wind_gusts_10m_max: days.map((d) => d.gust),
  },
});
const okFetch = (days: DayForecast[]) => vi.fn(async () => new Response(JSON.stringify(body(days)), { status: 200 })) as unknown as typeof fetch;

describe('классификация погоды', () => {
  it('нормальный день, дождь, гроза, ветер, мороз и жара', () => {
    expect(classifyDay(day()).risk).toBe('ok');
    expect(classifyDay(day({ code: 61 })).risk).toBe('bad');
    expect(classifyDay(day({ precipProb: 80 })).risk).toBe('bad');
    expect(classifyDay(day({ gust: 15 })).risk).toBe('bad');
    expect(classifyDay(day({ tMin: -18 })).risk).toBe('bad');
    expect(classifyDay(day({ code: 95 })).risk).toBe('dangerous');
    expect(classifyDay(day({ gust: 22 })).risk).toBe('dangerous');
    expect(classifyDay(day({ tMin: -27 })).risk).toBe('dangerous');
    expect(classifyDay(day({ tMax: 36 })).risk).toBe('dangerous');
  });

  it('для диапазона берётся худший день; нет данных на даты — null', () => {
    const days = [day({ date: '2026-10-17' }), day({ date: '2026-10-18', code: 95 })];
    expect(summarizeRange(days, { from: '2026-10-17', to: '2026-10-18' }, NOW)!.risk).toBe('dangerous');
    expect(summarizeRange(days, { from: '2026-10-17', to: '2026-10-17' }, NOW)!.risk).toBe('ok');
    expect(summarizeRange(days, { from: '2027-01-01', to: '2027-01-01' }, NOW)).toBeNull();
  });
});

describe('получение прогноза: сбои не ломают сервис', () => {
  it('разбирает корректный ответ и сохраняет источник и время', async () => {
    const w = await weatherFor({ from: '2026-10-17', to: '2026-10-17' }, NOW, okFetch([day({ code: 61 })]));
    expect(w).toMatchObject({ risk: 'bad', source: 'open-meteo', fetchedAt: NOW.toISOString() });
  });

  it('ошибка сети, не-200, мусор и пустой ответ -> null', async () => {
    const range = { from: '2026-10-17', to: '2026-10-17' };
    expect(await weatherFor(range, NOW, vi.fn(async () => { throw new Error('offline'); }) as unknown as typeof fetch)).toBeNull();
    resetWeatherCache();
    expect(await weatherFor(range, NOW, vi.fn(async () => new Response('x', { status: 503 })) as unknown as typeof fetch)).toBeNull();
    resetWeatherCache();
    expect(await weatherFor(range, NOW, vi.fn(async () => new Response('<html>', { status: 200 })) as unknown as typeof fetch)).toBeNull();
    resetWeatherCache();
    expect(await weatherFor(range, NOW, vi.fn(async () => new Response('{"daily":{}}', { status: 200 })) as unknown as typeof fetch)).toBeNull();
    expect(parseForecast({ daily: { time: ['2026-10-17'], weather_code: [null], temperature_2m_max: [1], temperature_2m_min: [0], precipitation_probability_max: [0], wind_gusts_10m_max: [0] } })).toBeNull();
  });

  it('кэширует на 30 минут и обновляет после', async () => {
    const f = okFetch([day()]);
    await loadForecast(f, NOW);
    await loadForecast(f, new Date(NOW.getTime() + 10 * 60_000));
    expect(f).toHaveBeenCalledTimes(1);
    await loadForecast(f, new Date(NOW.getTime() + 31 * 60_000));
    expect(f).toHaveBeenCalledTimes(2);
  });

  it('зависший запрос обрывается по таймауту', async () => {
    const hang = vi.fn((_u: unknown, init?: RequestInit) => new Promise<Response>((_res, rej) => init?.signal?.addEventListener('abort', () => rej(new Error('aborted'))))) as unknown as typeof fetch;
    vi.useFakeTimers();
    const p = loadForecast(hang, NOW);
    await vi.advanceTimersByTimeAsync(2600);
    expect(await p).toBeNull();
    vi.useRealTimers();
  });
});
