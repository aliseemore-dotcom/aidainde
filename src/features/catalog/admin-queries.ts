import { and, asc, desc, eq } from 'drizzle-orm';
import type { Db } from '@/db/client';
import { activities, eventOccurrences, events, media, places } from '@/db/schema';
import { getContentById } from './queries';
import type { ContentType } from '@/features/recommend/types';

const tableOf = (t: ContentType) => (t === 'place' ? places : t === 'event' ? events : activities);

export interface AdminRow { id: string; slug: string; title: string; status: string; isDemo: boolean; updatedAt: Date }

export async function listAdmin(db: Db, type: ContentType): Promise<AdminRow[]> {
  const t = tableOf(type);
  return db.select({ id: t.id, slug: t.slug, title: t.title, status: t.status, isDemo: t.isDemo, updatedAt: t.updatedAt })
    .from(t).orderBy(desc(t.updatedAt), asc(t.id)) as unknown as Promise<AdminRow[]>;
}

/** Запись в виде, пригодном для формы редактирования (включая черновики, теги, медиа, сеансы). */
export async function getEditable(db: Db, type: ContentType, id: string): Promise<Record<string, unknown> | null> {
  const d = await getContentById(db, type, id);
  if (!d) return null;
  const mediaRows = await db.select().from(media).where(and(eq(media.contentType, type), eq(media.contentId, id))).orderBy(asc(media.order));
  const occ = type === 'event' ? await db.select().from(eventOccurrences).where(eq(eventOccurrences.eventId, id)).orderBy(asc(eventOccurrences.startsAt)) : [];
  const { createdAt: _c, updatedAt: _u, publishedAt: _p, id: _i, ...rest } = d.record as Record<string, unknown>;
  void _c; void _u; void _p; void _i;
  return {
    ...rest, tags: d.tags,
    media: mediaRows.map((m) => ({ url: m.url, alt: m.alt, order: m.order, rightsStatus: m.rightsStatus })),
    ...(type === 'event' ? { occurrences: occ.map((o) => ({ startsAt: o.startsAt, endsAt: o.endsAt, status: o.status, ticketsUrl: o.ticketsUrl })) } : {}),
  };
}
