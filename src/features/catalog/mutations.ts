import { and, eq, inArray } from 'drizzle-orm';
import type { Db } from '@/db/client';
import { activities, auditLog, contentTags, eventOccurrences, events, media, places, tags as tagsTable } from '@/db/schema';
import { TAGS } from '@/features/recommend/tag-registry';
import { activityInput, eventInput, placeInput, publishIssues, type PublishIssue } from './validators';
import type { ContentType } from '@/features/recommend/types';
import { z } from 'zod';

type Input = z.infer<typeof placeInput> | z.infer<typeof eventInput> | z.infer<typeof activityInput>;

export class PublishError extends Error {
  constructor(public issues: PublishIssue[]) { super('PUBLISH_REQUIREMENTS'); }
}
export class SlugTakenError extends Error { constructor() { super('SLUG_TAKEN'); } }

const tableOf = (t: ContentType) => (t === 'place' ? places : t === 'event' ? events : activities);

/** Заполняет таблицу tags из реестра (идемпотентно). */
export async function seedTags(db: Db): Promise<void> {
  await db.insert(tagsTable).values(TAGS.map((t) => ({ key: t.key, label: t.label, group: t.group })))
    .onConflictDoUpdate({ target: tagsTable.key, set: { label: tagsTable.label } });
}

async function syncTags(db: Db, type: ContentType, id: string, keys: string[]) {
  await db.delete(contentTags).where(and(eq(contentTags.contentType, type), eq(contentTags.contentId, id)));
  if (!keys.length) return;
  const rows = await db.select({ id: tagsTable.id }).from(tagsTable).where(inArray(tagsTable.key, keys));
  if (rows.length !== new Set(keys).size) throw new Error('Теги не заведены в БД: выполните db:seed');
  await db.insert(contentTags).values(rows.map((r) => ({ contentType: type, contentId: id, tagId: r.id })));
}

async function syncMedia(db: Db, type: ContentType, id: string, items: { url: string; alt: string; order: number; rightsStatus: 'owned' | 'licensed' | 'permission' | 'unknown' }[]) {
  await db.delete(media).where(and(eq(media.contentType, type), eq(media.contentId, id)));
  if (items.length) await db.insert(media).values(items.map((m) => ({ ...m, contentType: type, contentId: id })));
}

async function syncOccurrences(db: Db, id: string, items: z.infer<typeof eventInput>['occurrences']) {
  await db.delete(eventOccurrences).where(eq(eventOccurrences.eventId, id));
  if (items.length) await db.insert(eventOccurrences).values(items.map((o) => ({ ...o, eventId: id })));
}

function splitInput(type: ContentType, v: Input) {
  const { tags, media: m, ...rest } = v as Input & { tags: string[]; media: { url: string; alt: string; order: number; rightsStatus: 'owned' | 'licensed' | 'permission' | 'unknown' }[] };
  const { occurrences, ...row } = rest as typeof rest & { occurrences?: z.infer<typeof eventInput>['occurrences'] };
  return { tags, media: m, occurrences: type === 'event' ? occurrences ?? [] : [], row: row as typeof row & { status: string } };
}

function checkPublishable(type: ContentType, v: Input) {
  if (v.status !== 'published') return;
  const issues = publishIssues(type, v as unknown as Record<string, unknown>);
  if (issues.length) throw new PublishError(issues);
}

export async function createContent(db: Db, type: ContentType, raw: unknown, adminUserId: string): Promise<string> {
  const v = parseInput(type, raw);
  checkPublishable(type, v);
  const { tags, media: m, occurrences, row } = splitInput(type, v);
  const table = tableOf(type);
  const now = new Date();
  try {
    const [created] = await db.insert(table).values({ ...row, publishedAt: row.status === 'published' ? now : null } as never).returning({ id: table.id });
    const id = created!.id;
    await syncTags(db, type, id, tags);
    await syncMedia(db, type, id, m);
    if (type === 'event') await syncOccurrences(db, id, occurrences);
    await db.insert(auditLog).values({ adminUserId, action: 'create', contentType: type, contentId: id, diffJson: { slug: row.slug, status: row.status } });
    return id;
  } catch (e) {
    if (isSlugConflict(e)) throw new SlugTakenError();
    throw e;
  }
}

export async function updateContent(db: Db, type: ContentType, id: string, raw: unknown, adminUserId: string): Promise<boolean> {
  const v = parseInput(type, raw);
  checkPublishable(type, v);
  const { tags, media: m, occurrences, row } = splitInput(type, v);
  const table = tableOf(type);
  const [prev] = await db.select({ status: table.status, publishedAt: table.publishedAt }).from(table).where(eq(table.id, id)).limit(1);
  if (!prev) return false;
  const now = new Date();
  const publishedAt = row.status === 'published' ? prev.publishedAt ?? now : prev.publishedAt;
  try {
    await db.update(table).set({ ...row, publishedAt, updatedAt: now } as never).where(eq(table.id, id));
  } catch (e) {
    if (isSlugConflict(e)) throw new SlugTakenError();
    throw e;
  }
  await syncTags(db, type, id, tags);
  await syncMedia(db, type, id, m);
  if (type === 'event') await syncOccurrences(db, id, occurrences);
  await db.insert(auditLog).values({ adminUserId, action: 'update', contentType: type, contentId: id, diffJson: { from: prev.status, to: row.status } });
  return true;
}

/** «Снять с публикации» одним действием. */
export async function unpublishContent(db: Db, type: ContentType, id: string, adminUserId: string): Promise<boolean> {
  const table = tableOf(type);
  const res = await db.update(table).set({ status: 'draft', updatedAt: new Date() } as never).where(eq(table.id, id)).returning({ id: table.id });
  if (!res.length) return false;
  await db.insert(auditLog).values({ adminUserId, action: 'unpublish', contentType: type, contentId: id });
  return true;
}

export async function deleteContent(db: Db, type: ContentType, id: string, adminUserId: string): Promise<boolean> {
  const table = tableOf(type);
  const res = await db.delete(table).where(eq(table.id, id)).returning({ id: table.id });
  if (!res.length) return false;
  await db.delete(contentTags).where(and(eq(contentTags.contentType, type), eq(contentTags.contentId, id)));
  await db.delete(media).where(and(eq(media.contentType, type), eq(media.contentId, id)));
  await db.insert(auditLog).values({ adminUserId, action: 'delete', contentType: type, contentId: id });
  return true;
}

function isSlugConflict(e: unknown): boolean {
  const err = e as { message?: string; cause?: { message?: string } };
  return `${err.message ?? ''} ${err.cause?.message ?? ''}`.includes('_slug_uq');
}

function parseInput(type: ContentType, raw: unknown): Input {
  const schema = type === 'place' ? placeInput : type === 'event' ? eventInput : activityInput;
  return schema.parse(raw);
}
