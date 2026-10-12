import { z } from 'zod';
import { addDays, type DateRange } from './date-kazan';

/**
 * Прогноз погоды — необязательное улучшение (§9): при любой ошибке возвращаем null, и сервис работает без него.
 * Источник — Open-Meteo (без ключа), Казань. Сохраняем время получения и источник.
 */
export type WeatherRisk = 'ok' | 'bad' | 'dangerous';
export interface WeatherSummary { risk: WeatherRisk; summary: string; source: 'open-meteo'; fetchedAt: string }

const KAZAN = { lat: 55.79, lng: 49.12 };
const URL_ = `https://api.open-meteo.com/v1/forecast?latitude=${KAZAN.lat}&longitude=${KAZAN.lng}`
  + '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,wind_gusts_10m_max'
  + '&wind_speed_unit=ms&timezone=Europe%2FMoscow&forecast_days=16';

const daily = z.object({
  time: z.array(z.string()),
  weather_code: z.array(z.number().nullable()),
  temperature_2m_max: z.array(z.number().nullable()),
  temperature_2m_min: z.array(z.number().nullable()),
  precipitation_probability_max: z.array(z.number().nullable()),
  wind_gusts_10m_max: z.array(z.number().nullable()),
});
const payload = z.object({ daily });

export interface DayForecast { date: string; code: number; tMax: number; tMin: number; precipProb: number; gust: number }

const THUNDER = new Set([95, 96, 99]);
const WET = new Set([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 71, 73, 75, 77, 80, 81, 82, 85, 86]);
const HEAVY = new Set([65, 67, 75, 82, 86]);

/** Классификация дня. Пороги — константы, описаны в DECISIONS. */
export function classifyDay(d: DayForecast): { risk: WeatherRisk; summary: string } {
  if (THUNDER.has(d.code)) return { risk: 'dangerous', summary: 'ожидается гроза' };
  if (d.gust >= 20) return { risk: 'dangerous', summary: 'ожидается очень сильный ветер' };
  if (d.tMin <= -25) return { risk: 'dangerous', summary: 'ожидается сильный мороз' };
  if (d.tMax >= 35) return { risk: 'dangerous', summary: 'ожидается сильная жара' };
  if (HEAVY.has(d.code)) return { risk: 'bad', summary: 'ожидаются сильные осадки' };
  if (WET.has(d.code) || d.precipProb >= 60) return { risk: 'bad', summary: 'вероятны осадки' };
  if (d.gust >= 14) return { risk: 'bad', summary: 'ожидается сильный ветер' };
  if (d.tMin <= -15) return { risk: 'bad', summary: 'ожидается мороз' };
  return { risk: 'ok', summary: 'без заметных осадков' };
}

const RANK: Record<WeatherRisk, number> = { ok: 0, bad: 1, dangerous: 2 };

/** Худший день внутри диапазона; null, если прогноза на эти даты нет. */
export function summarizeRange(days: DayForecast[], range: DateRange, fetchedAt: Date): WeatherSummary | null {
  const inRange: DayForecast[] = [];
  for (let d = range.from; d <= range.to; d = addDays(d, 1)) { const f = days.find((x) => x.date === d); if (f) inRange.push(f); }
  if (!inRange.length) return null;
  const worst = inRange.map(classifyDay).reduce((a, b) => (RANK[b.risk] > RANK[a.risk] ? b : a));
  return { ...worst, source: 'open-meteo', fetchedAt: fetchedAt.toISOString() };
}

export function parseForecast(json: unknown): DayForecast[] | null {
  const p = payload.safeParse(json);
  if (!p.success) return null;
  const d = p.data.daily;
  const out: DayForecast[] = [];
  d.time.forEach((date, i) => {
    const code = d.weather_code[i]; const tMax = d.temperature_2m_max[i]; const tMin = d.temperature_2m_min[i];
    if (code == null || tMax == null || tMin == null) return; // неполные данные не используем
    out.push({ date, code, tMax, tMin, precipProb: d.precipitation_probability_max[i] ?? 0, gust: d.wind_gusts_10m_max[i] ?? 0 });
  });
  return out.length ? out : null;
}

let cache: { at: number; days: DayForecast[]; fetchedAt: Date } | null = null;
const TTL_MS = 30 * 60_000;
export const resetWeatherCache = () => { cache = null; };

/** Загружает прогноз (кэш 30 мин, таймаут 2,5 с). Любой сбой -> null. */
export async function loadForecast(fetchImpl: typeof fetch = fetch, now = new Date()): Promise<{ days: DayForecast[]; fetchedAt: Date } | null> {
  if (cache && now.getTime() - cache.at < TTL_MS) return cache;
  try {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 2500);
    const res = await fetchImpl(URL_, { signal: ctl.signal, cache: 'no-store' }).finally(() => clearTimeout(timer));
    if (!res.ok) return null;
    const days = parseForecast(await res.json());
    if (!days) return null;
    cache = { at: now.getTime(), days, fetchedAt: now };
    return cache;
  } catch {
    return null;
  }
}

/** Погода для диапазона дат; null — «прогноза нет» (UI тогда показывает нейтральное «Проверьте погоду»). */
export async function weatherFor(range: DateRange, now = new Date(), fetchImpl: typeof fetch = fetch): Promise<WeatherSummary | null> {
  const f = await loadForecast(fetchImpl, now);
  return f ? summarizeRange(f.days, range, f.fetchedAt) : null;
}
