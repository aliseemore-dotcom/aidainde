import { and, count, eq, isNull } from 'drizzle-orm';
import type { Db } from '@/db/client';
import { activities, events, places } from '@/db/schema';

export interface LaunchProblem { code: string; message: string }

/** Проверка перед выходом на боевой домен (§16, Sprint 4): никакого demo и «дыр» в опубликованном. */
export async function launchProblems(db: Db): Promise<LaunchProblem[]> {
  const n = async (q: Promise<{ n: number }[]>) => Number((await q)[0]?.n ?? 0);
  const out: LaunchProblem[] = [];
  const demo = (await Promise.all([places, events, activities].map((t) => n(db.select({ n: count() }).from(t).where(eq(t.isDemo, true)))))).reduce((a, b) => a + b, 0);
  if (demo > 0) out.push({ code: 'demo_present', message: `В базе ${demo} демо-записей: удалите их до запуска (в production они не показываются, но лежат в базе)` });
  const evNoVerify = await n(db.select({ n: count() }).from(events).where(and(eq(events.status, 'published'), isNull(events.verifiedAt))));
  if (evNoVerify) out.push({ code: 'event_unverified', message: `Опубликовано событий без даты проверки: ${evNoVerify}` });
  const plNoSource = await n(db.select({ n: count() }).from(places).where(and(eq(places.status, 'published'), isNull(places.verifiedAt))));
  if (plNoSource) out.push({ code: 'place_unverified', message: `Опубликовано мест без даты проверки: ${plNoSource}` });
  const published = (await Promise.all([places, events, activities].map((t) => n(db.select({ n: count() }).from(t).where(and(eq(t.status, 'published'), eq(t.isDemo, false))))))).reduce((a, b) => a + b, 0);
  if (published === 0) out.push({ code: 'empty_catalog', message: 'Нет ни одной опубликованной реальной записи: подборка будет пустой' });
  return out;
}
