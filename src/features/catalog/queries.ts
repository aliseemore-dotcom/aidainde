import { and, asc, count, desc, eq, exists, gte, ilike, inArray, lte, ne, or, sql, type SQL } from 'drizzle-orm';
import type { Db } from '@/db/client';
import {
  activities, contentTags, eventOccurrences, events, media, places, tags as tagsTable,
} from '@/db/schema';
import { kazanDayBounds } from '@/lib/date-kazan';
import type { Candidate, ContentType, Occurrence } from '@/features/recommend/types';
import type { CatalogQuery } from './validators';

const PUBLIC_STATUSES = {
  place: ['published'], event: ['published', 'cancelled', 'sold_out'], activity: ['published'],
} as const;

type AnyRow = Record<string, unknown>;

async function tagMap(db: Db, type: ContentType, ids: string[]): Promise<Map<string, string[]>> {
  const m = new Map<string, string[]>();
  if (!ids.length) return m;
  const rows = await db
    .select({ id: contentTags.contentId, key: tagsTable.key })
    .from(contentTags)
    .innerJoin(tagsTable, eq(tagsTable.id, contentTags.tagId))
    .where(and(eq(contentTags.contentType, type), inArray(contentTags.contentId, ids)));
  for (const r of rows) m.set(r.id, [...(m.get(r.id) ?? []), r.key]);
  return m;
}

async function imageSet(db: Db, type: ContentType, ids: string[]): Promise<Set<string>> {
  if (!ids.length) return new Set();
  const rows = await db.select({ id: media.contentId }).from(media)
    .where(and(eq(media.contentType, type), inArray(media.contentId, ids), ne(media.rightsStatus, 'unknown')));
  return new Set(rows.map((r) => r.id));
}

// ---------------------------------------------------------------- кандидаты для движка

export async function loadCandidates(db: Db, opts: { allowDemo: boolean }): Promise<Candidate[]> {
  const demo = (isDemo: unknown) => (opts.allowDemo ? undefined : eq(isDemo as never, false));
  const [pl, ev, ac] = await Promise.all([
    db.select().from(places).where(and(eq(places.status, 'published'), demo(places.isDemo))),
    db.select().from(events).where(and(eq(events.status, 'published'), demo(events.isDemo))),
    db.select().from(activities).where(and(eq(activities.status, 'published'), demo(activities.isDemo))),
  ]);
  const evIds = ev.map((e) => e.id);
  const [pt, et, at, pi, ei, ai, occ, evPlaces] = await Promise.all([
    tagMap(db, 'place', pl.map((p) => p.id)), tagMap(db, 'event', evIds), tagMap(db, 'activity', ac.map((a) => a.id)),
    imageSet(db, 'place', pl.map((p) => p.id)), imageSet(db, 'event', evIds), imageSet(db, 'activity', ac.map((a) => a.id)),
    evIds.length ? db.select().from(eventOccurrences).where(inArray(eventOccurrences.eventId, evIds)) : Promise.resolve([]),
    (async () => {
      const ids = ev.map((e) => e.placeId).filter((x): x is string => !!x);
      return ids.length ? db.select().from(places).where(inArray(places.id, ids)) : [];
    })(),
  ]);
  const placeById = new Map(evPlaces.map((p) => [p.id, p]));
  const occBy = new Map<string, Occurrence[]>();
  for (const o of occ) occBy.set(o.eventId, [...(occBy.get(o.eventId) ?? []), { startsAt: o.startsAt, endsAt: o.endsAt, status: o.status, ticketsUrl: o.ticketsUrl }]);

  const out: Candidate[] = [];
  for (const p of pl) out.push({
    type: 'place', id: p.id, slug: p.slug, title: p.title, description: p.description, status: p.status, isDemo: p.isDemo, kind: p.kind,
    tags: pt.get(p.id) ?? [], setting: p.indoorOutdoor, priceMin: p.priceMin, priceMax: p.priceMax, priceUnit: p.priceUnit,
    ageMin: p.ageMin, ageMax: p.ageMax, minParticipants: p.minParticipants, maxParticipants: p.maxParticipants,
    soloFriendly: p.soloFriendly, joinOpenGroup: p.joinOpenGroup, requiresBooking: p.requiresBooking, durationMinutes: p.durationMinutes,
    occurrences: [], expiresAt: null, verifiedAt: p.verifiedAt, sourceUrl: p.sourceUrl, address: p.address, district: p.district,
    hasOpeningHours: !!p.openingHoursJson && Object.keys(p.openingHoursJson).length > 0, hasImage: pi.has(p.id),
    publishedAt: p.publishedAt, updatedAt: p.updatedAt,
  });
  for (const e of ev) {
    const pl2 = e.placeId ? placeById.get(e.placeId) : undefined;
    const own: Occurrence = { startsAt: e.startsAt, endsAt: e.endsAt, status: 'published', ticketsUrl: e.ticketsUrl };
    out.push({
      type: 'event', id: e.id, slug: e.slug, title: e.title, description: e.description, status: e.status, isDemo: e.isDemo,
      tags: et.get(e.id) ?? [], setting: e.indoorOutdoor ?? pl2?.indoorOutdoor ?? 'unknown',
      priceMin: e.priceMin, priceMax: e.priceMax, priceUnit: e.priceUnit, ageMin: e.ageMin ?? pl2?.ageMin ?? null, ageMax: e.ageMax,
      minParticipants: null, maxParticipants: e.capacity, soloFriendly: e.soloFriendly, joinOpenGroup: e.joinOpenGroup,
      requiresBooking: e.requiresBooking, durationMinutes: null, occurrences: [own, ...(occBy.get(e.id) ?? [])],
      expiresAt: e.expiresAt, verifiedAt: e.verifiedAt, sourceUrl: e.sourceUrl, address: pl2?.address ?? null, district: pl2?.district ?? null,
      hasOpeningHours: false, hasImage: ei.has(e.id), publishedAt: e.publishedAt, updatedAt: e.updatedAt,
    });
  }
  for (const a of ac) out.push({
    type: 'activity', id: a.id, slug: a.slug, title: a.title, description: a.description, status: a.status, isDemo: a.isDemo,
    tags: at.get(a.id) ?? [], setting: 'home', priceMin: a.costMin, priceMax: a.costMax, priceUnit: 'total',
    ageMin: a.ageMin, ageMax: a.ageMax, minParticipants: a.minParticipants, maxParticipants: a.maxParticipants,
    soloFriendly: null, joinOpenGroup: null, requiresBooking: false, durationMinutes: a.durationMinutes, occurrences: [],
    expiresAt: null, verifiedAt: null, sourceUrl: a.sourceUrl, address: null, district: null, hasOpeningHours: false,
    hasImage: ai.has(a.id), publishedAt: a.publishedAt, updatedAt: a.updatedAt,
  });
  return out;
}

// ---------------------------------------------------------------- публичный каталог

export interface CardSummary {
  type: ContentType; id: string; slug: string; title: string; status: string; isDemo: boolean;
  tags: string[]; startsAt: string | null; priceMin: number | null; priceMax: number | null;
  priceUnit: 'per_person' | 'total' | 'unknown'; district: string | null; kind: string | null;
}

const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

export async function listCatalog(
  db: Db, q: CatalogQuery, opts: { allowDemo: boolean; now: Date },
): Promise<{ items: CardSummary[]; total: number; page: number; pageSize: number }> {
  const t = q.type;
  const table = t === 'place' ? places : t === 'event' ? events : activities;
  const conds: (SQL | undefined)[] = [
    inArray(table.status, PUBLIC_STATUSES[t] as unknown as ('published')[]),
    opts.allowDemo ? undefined : eq(table.isDemo, false),
  ];
  if (q.category) {
    conds.push(exists(
      db.select({ one: sql`1` }).from(contentTags).innerJoin(tagsTable, eq(tagsTable.id, contentTags.tagId))
        .where(and(eq(contentTags.contentType, t), eq(contentTags.contentId, table.id), eq(tagsTable.key, q.category))),
    ));
  }
  if (q.q) {
    const like = `%${escapeLike(q.q)}%`;
    conds.push(or(ilike(table.title, like), ilike(table.description, like)));
  }
  if (q.priceMax != null) {
    const min = t === 'activity' ? activities.costMin : t === 'place' ? places.priceMin : events.priceMin;
    conds.push(and(sql`${min} is not null`, lte(min, q.priceMax)));
  }
  if (t === 'event') {
    if (q.date) {
      const { start, end } = kazanDayBounds({ from: q.date, to: q.date });
      conds.push(or(
        and(gte(events.startsAt, start), sql`${events.startsAt} < ${end}`),
        exists(db.select({ one: sql`1` }).from(eventOccurrences).where(and(
          eq(eventOccurrences.eventId, events.id), gte(eventOccurrences.startsAt, start), sql`${eventOccurrences.startsAt} < ${end}`,
        ))),
      ));
    } else {
      // без даты — только предстоящие
      conds.push(or(
        sql`coalesce(${events.endsAt}, ${events.startsAt}) >= ${opts.now}`,
        exists(db.select({ one: sql`1` }).from(eventOccurrences).where(and(
          eq(eventOccurrences.eventId, events.id), sql`coalesce(${eventOccurrences.endsAt}, ${eventOccurrences.startsAt}) >= ${opts.now}`,
        ))),
      ));
    }
  }
  const where = and(...conds);
  const order = t === 'event' ? asc(events.startsAt) : desc(table.publishedAt);
  const [{ n }] = (await db.select({ n: count() }).from(table).where(where)) as [{ n: number }];
  const rows = (await db.select().from(table).where(where).orderBy(order, asc(table.id))
    .limit(q.pageSize).offset((q.page - 1) * q.pageSize)) as AnyRow[];
  const tm = await tagMap(db, t, rows.map((r) => r.id as string));
  const items = rows.map<CardSummary>((r) => ({
    type: t, id: r.id as string, slug: r.slug as string, title: r.title as string, status: r.status as string, isDemo: r.isDemo as boolean,
    tags: tm.get(r.id as string) ?? [],
    startsAt: t === 'event' ? (r.startsAt as Date).toISOString() : null,
    priceMin: (t === 'activity' ? r.costMin : r.priceMin) as number | null,
    priceMax: (t === 'activity' ? r.costMax : r.priceMax) as number | null,
    priceUnit: (t === 'activity' ? 'total' : r.priceUnit) as 'per_person' | 'total' | 'unknown',
    district: (r.district as string | null) ?? null,
    kind: t === 'place' ? ((r.kind as string | null) ?? null) : null,
  }));
  return { items, total: Number(n), page: q.page, pageSize: q.pageSize };
}

// ---------------------------------------------------------------- карточка

export interface ContentDetail {
  type: ContentType; id: string; slug: string; status: string; isDemo: boolean; tags: string[];
  record: AnyRow;
  media: { url: string; alt: string; order: number }[];
  place: { slug: string; title: string; address: string; lat: number | null; lng: number | null } | null;
  occurrences: { startsAt: Date; endsAt: Date | null; status: string; ticketsUrl: string | null }[];
}

/** Публичная карточка. Черновики и архив не отдаются никогда (includeDraft — только для превью редактора). */
export async function getContentBySlug(
  db: Db, type: ContentType, slug: string, opts: { allowDemo: boolean; includeDraft?: boolean },
): Promise<ContentDetail | null> {
  const table = type === 'place' ? places : type === 'event' ? events : activities;
  const [row] = (await db.select().from(table).where(eq(table.slug, slug)).limit(1)) as AnyRow[];
  if (!row) return null;
  if (!opts.includeDraft) {
    if (!(PUBLIC_STATUSES[type] as readonly string[]).includes(row.status as string)) return null;
    if (row.isDemo && !opts.allowDemo) return null;
  }
  return buildDetail(db, type, row);
}

export async function getContentById(db: Db, type: ContentType, id: string): Promise<ContentDetail | null> {
  const table = type === 'place' ? places : type === 'event' ? events : activities;
  const [row] = (await db.select().from(table).where(eq(table.id, id)).limit(1)) as AnyRow[];
  return row ? buildDetail(db, type, row) : null;
}

async function buildDetail(db: Db, type: ContentType, row: AnyRow): Promise<ContentDetail> {
  const id = row.id as string;
  const [tm, mediaRows] = await Promise.all([
    tagMap(db, type, [id]),
    db.select().from(media).where(and(eq(media.contentType, type), eq(media.contentId, id))).orderBy(asc(media.order)),
  ]);
  let place: ContentDetail['place'] = null;
  let occurrences: ContentDetail['occurrences'] = [];
  if (type === 'event') {
    if (row.placeId) {
      const [p] = await db.select().from(places).where(eq(places.id, row.placeId as string)).limit(1);
      if (p && p.status === 'published') place = { slug: p.slug, title: p.title, address: p.address, lat: p.lat, lng: p.lng };
    }
    occurrences = (await db.select().from(eventOccurrences).where(eq(eventOccurrences.eventId, id)).orderBy(asc(eventOccurrences.startsAt)))
      .map((o) => ({ startsAt: o.startsAt, endsAt: o.endsAt, status: o.status, ticketsUrl: o.ticketsUrl }));
  }
  return {
    type, id, slug: row.slug as string, status: row.status as string, isDemo: row.isDemo as boolean,
    tags: tm.get(id) ?? [], record: row,
    media: mediaRows.map((m) => ({ url: m.url, alt: m.alt, order: m.order, rightsStatus: m.rightsStatus })).filter((m) => m.rightsStatus !== 'unknown')
      .map(({ url, alt, order }) => ({ url, alt, order })),
    place, occurrences,
  };
}

/** Для sitemap: slug'и публичных записей. */
export async function listPublicSlugs(db: Db, opts: { allowDemo: boolean }) {
  const demo = (c: unknown) => (opts.allowDemo ? undefined : eq(c as never, false));
  const [p, e, a] = await Promise.all([
    db.select({ slug: places.slug, updatedAt: places.updatedAt }).from(places).where(and(eq(places.status, 'published'), demo(places.isDemo))),
    db.select({ slug: events.slug, updatedAt: events.updatedAt }).from(events).where(and(inArray(events.status, ['published', 'sold_out']), demo(events.isDemo))),
    db.select({ slug: activities.slug, updatedAt: activities.updatedAt }).from(activities).where(and(eq(activities.status, 'published'), demo(activities.isDemo))),
  ]);
  return { places: p, events: e, activities: a };
}

