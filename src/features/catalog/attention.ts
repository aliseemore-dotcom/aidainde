import { and, eq, inArray } from 'drizzle-orm';
import type { Db } from '@/db/client';
import { eventOccurrences, events, places } from '@/db/schema';

export type AttentionCode = 'event_stale_check' | 'event_finished' | 'place_unverified' | 'place_stale_check';
export interface AttentionItem { type: 'event' | 'place'; id: string; title: string; code: AttentionCode; detail: string }

export const EVENT_RECHECK_DAYS = 14;
export const PLACE_RECHECK_DAYS = 180;
const DAY = 86_400_000;

interface EventRow { id: string; title: string; startsAt: Date; endsAt: Date | null; verifiedAt: Date | null; occ: { startsAt: Date; endsAt: Date | null }[] }
interface PlaceRow { id: string; title: string; verifiedAt: Date | null }

/** Чистая классификация (тестируется отдельно от БД): что редактору стоит перепроверить или заархивировать. */
export function classifyAttention(evs: EventRow[], pls: PlaceRow[], now: Date): AttentionItem[] {
  const out: AttentionItem[] = [];
  for (const e of evs) {
    const ends = [e.endsAt ?? e.startsAt, ...e.occ.map((o) => o.endsAt ?? o.startsAt)];
    const last = Math.max(...ends.map((d) => d.getTime()));
    if (last < now.getTime()) { out.push({ type: 'event', id: e.id, title: e.title, code: 'event_finished', detail: 'Событие закончилось: переведите в архив' }); continue; }
    if (!e.verifiedAt || now.getTime() - e.verifiedAt.getTime() > EVENT_RECHECK_DAYS * DAY) {
      out.push({ type: 'event', id: e.id, title: e.title, code: 'event_stale_check', detail: e.verifiedAt ? `Проверено более ${EVENT_RECHECK_DAYS} дней назад` : 'Нет даты проверки' });
    }
  }
  for (const p of pls) {
    if (!p.verifiedAt) out.push({ type: 'place', id: p.id, title: p.title, code: 'place_unverified', detail: 'Нет даты проверки' });
    else if (now.getTime() - p.verifiedAt.getTime() > PLACE_RECHECK_DAYS * DAY) out.push({ type: 'place', id: p.id, title: p.title, code: 'place_stale_check', detail: `Проверено более ${PLACE_RECHECK_DAYS} дней назад` });
  }
  return out;
}

export async function loadAttention(db: Db, now: Date): Promise<AttentionItem[]> {
  const ev = await db.select({ id: events.id, title: events.title, startsAt: events.startsAt, endsAt: events.endsAt, verifiedAt: events.verifiedAt })
    .from(events).where(eq(events.status, 'published'));
  const ids = ev.map((e) => e.id);
  const occ = ids.length ? await db.select().from(eventOccurrences).where(and(inArray(eventOccurrences.eventId, ids))) : [];
  const pl = await db.select({ id: places.id, title: places.title, verifiedAt: places.verifiedAt }).from(places).where(eq(places.status, 'published'));
  return classifyAttention(
    ev.map((e) => ({ ...e, occ: occ.filter((o) => o.eventId === e.id) })), pl, now,
  );
}
