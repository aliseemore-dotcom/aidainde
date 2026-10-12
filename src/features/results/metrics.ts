import { sql } from 'drizzle-orm';
import type { Db } from '@/db/client';
import { metricsDaily } from '@/db/schema';
import { todayKazan } from '@/lib/date-kazan';

/**
 * Приватная аналитика: только суммы по дням и ключам (без токенов, ответов целиком, IP и устройств).
 * Ошибка записи никогда не влияет на ответ пользователю.
 */
export async function recordMetrics(db: Db, keys: string[], now: Date): Promise<void> {
  try {
    const day = todayKazan(now);
    for (const key of keys) {
      await db.insert(metricsDaily).values({ day, key, n: 1 })
        .onConflictDoUpdate({ target: [metricsDaily.day, metricsDaily.key], set: { n: sql`${metricsDaily.n} + 1` } });
    }
  } catch (e) {
    console.error('[metrics] write failed', e instanceof Error ? e.message : 'unknown');
  }
}

export interface MetricsSummary { days: number; totals: Record<string, number> }

export async function readMetrics(db: Db, now: Date, days = 14): Promise<MetricsSummary> {
  const from = new Date(now.getTime() - (days - 1) * 86_400_000);
  const rows = await db.select().from(metricsDaily).where(sql`${metricsDaily.day} >= ${todayKazan(from)}`);
  const totals: Record<string, number> = {};
  for (const r of rows) totals[r.key] = (totals[r.key] ?? 0) + r.n;
  return { days, totals };
}
