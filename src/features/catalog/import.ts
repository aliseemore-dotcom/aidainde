import { z } from 'zod';
import type { Db } from '@/db/client';
import { eq } from 'drizzle-orm';
import { activities, events, places } from '@/db/schema';
import { createContent, PublishError, SlugTakenError } from './mutations';
import { inputByType } from './validators';
import { duplicateKey } from './duplicates';
import { allowedImageHosts } from '@/lib/env';
import { isAllowedImageUrl } from '@/lib/security';
import type { ContentType } from '@/features/recommend/types';

/** Заглушки вида [ЦЕНА] / [НАЗВАНИЕ] (соглашение дизайн-кита): такие записи в каталог не попадают. */
const PLACEHOLDER = /\[[A-ZА-ЯЁ0-9_ ./-]{2,}\]/;

const record = z.object({ type: z.enum(['place', 'event', 'activity']) }).passthrough();

export interface ParsedRecord { index: number; type: ContentType; data: Record<string, unknown> }
export interface ImportIssue { index: number; slug?: string; message: string }

function hasPlaceholder(v: unknown): boolean {
  if (typeof v === 'string') return PLACEHOLDER.test(v);
  if (Array.isArray(v)) return v.some(hasPlaceholder);
  if (v && typeof v === 'object') return Object.values(v).some(hasPlaceholder);
  return false;
}

/** Допустимые поля записи: схема валидации + type (+ placeSlug у события). Всё остальное — ошибка, а не молчаливая потеря. */
export function allowedFields(type: ContentType): Set<string> {
  const keys = Object.keys(inputByType[type].shape);
  return new Set(['type', ...keys, ...(type === 'event' ? ['placeSlug'] : [])]);
}

/** Проверяет файл целиком, ничего не записывая. imageHosts по умолчанию берётся из IMAGE_HOSTS. */
export function parseImport(json: unknown, opts: { imageHosts?: string[] } = {}): { records: ParsedRecord[]; issues: ImportIssue[] } {
  const issues: ImportIssue[] = [];
  const records: ParsedRecord[] = [];
  if (!Array.isArray(json)) return { records, issues: [{ index: -1, message: 'Ожидается JSON-массив записей' }] };
  const hosts = opts.imageHosts ?? allowedImageHosts();
  const seen = new Set<string>();
  const seenDup = new Map<string, number>();
  json.forEach((raw, index) => {
    const head = record.safeParse(raw);
    if (!head.success) { issues.push({ index, message: 'У записи нет корректного поля type (place | event | activity)' }); return; }
    const { type, ...rest } = head.data as { type: ContentType } & Record<string, unknown>;
    const slug = typeof rest.slug === 'string' ? rest.slug : undefined;
    if (hasPlaceholder(rest)) { issues.push({ index, slug, message: 'Есть незаполненные заглушки вида [ЦЕНА]: запись пропущена' }); return; }
    if (rest.isDemo === true) { issues.push({ index, slug, message: 'Демо-записи через импорт не загружаются' }); return; }
    const key = `${type}:${slug}`;
    if (slug && seen.has(key)) { issues.push({ index, slug, message: 'Повторяется slug в файле' }); return; }
    if (slug) seen.add(key);
    const unknown = Object.keys(rest).filter((k) => !allowedFields(type).has(k));
    if (unknown.length) { issues.push({ index, slug, message: `Неизвестные поля: ${unknown.map((k) => `«${k}»`).join(', ')} (проверьте написание по руководству): запись пропущена` }); return; }
    // статус задаёт команда импорта, а не файл: черновик, пока человек не опубликует в админке
    if (rest.status !== undefined && rest.status !== 'draft') { issues.push({ index, slug, message: 'Поле status в файле не допускается: записи загружаются черновиками' }); return; }
    const badImage = (Array.isArray(rest.media) ? rest.media : []).find((m) => typeof (m as { url?: unknown })?.url !== 'string' || !isAllowedImageUrl((m as { url: string }).url, hosts));
    if (badImage) { issues.push({ index, slug, message: `Изображение «${String((badImage as { url?: unknown }).url)}» не из разрешённых https-доменов (IMAGE_HOSTS): уберите media или добавьте домен` }); return; }
    const data = { status: 'draft', isDemo: false, ...rest };
    const parsed = inputByType[type].safeParse(data);
    if (!parsed.success) {
      issues.push({ index, slug, message: parsed.error.issues.map((i) => `${i.path.join('.') || 'запись'}: ${i.message}`).join('; ') });
      return;
    }
    // дубликаты по смыслу внутри файла (правила — duplicates.ts)
    const p = parsed.data as { title: string; address?: string; startsAt?: Date; placeId?: string | null };
    const dup = duplicateKey(type, { title: p.title, address: p.address, startsAt: p.startsAt, placeRef: (rest.placeSlug as string | undefined) ?? p.placeId });
    if (seenDup.has(dup)) { issues.push({ index, slug, message: `Дубликат записи №${seenDup.get(dup)! + 1} в этом файле («${p.title}»): пропущено` }); return; }
    seenDup.set(dup, index);
    records.push({ index, type, data });
  });
  return { records, issues };
}

export interface ImportResult { created: number; skipped: ImportIssue[] }

/** Записывает проверенные записи. Не публикует, пока явно не передано publish. Конфликты slug пропускаются. */
export async function runImport(db: Db, records: ParsedRecord[], adminUserId: string, opts: { publish?: boolean } = {}): Promise<ImportResult> {
  let created = 0;
  const skipped: ImportIssue[] = [];
  const existing = await loadExistingKeys(db, new Set(records.map((r) => r.type)));
  for (const r of records) {
    const slug = typeof r.data.slug === 'string' ? r.data.slug : undefined;
    try {
      const { placeSlug, ...data } = r.data as Record<string, unknown> & { placeSlug?: unknown };
      if (r.type === 'event' && typeof placeSlug === 'string' && placeSlug) {
        const [p] = await db.select({ id: places.id }).from(places).where(eq(places.slug, placeSlug)).limit(1);
        if (!p) { skipped.push({ index: r.index, slug, message: `Площадка «${placeSlug}» не найдена: сначала загрузите места` }); continue; }
        data.placeId = p.id;
      }
      const d = data as { title: string; address?: string; startsAt?: string; placeId?: string };
      const dup = duplicateKey(r.type, { title: d.title, address: d.address, startsAt: d.startsAt, placeRef: d.placeId ?? null });
      const same = existing.get(dup);
      if (same) { skipped.push({ index: r.index, slug, message: `Похоже на дубликат существующей записи «${same}»: пропущено` }); continue; }
      await createContent(db, r.type, opts.publish ? { ...data, status: 'published' } : data, adminUserId);
      existing.set(dup, slug ?? d.title);
      created++;
    } catch (e) {
      const message = e instanceof SlugTakenError ? 'Такой slug уже есть: пропущено'
        : e instanceof PublishError ? `Не хватает данных для публикации: ${e.issues.map((i) => i.field).join(', ')}`
        : e instanceof Error ? e.message : 'Ошибка записи';
      skipped.push({ index: r.index, slug, message });
    }
  }
  return { created, skipped };
}

/** Ключи уже имеющихся в каталоге записей (по правилам duplicates.ts) -> slug существующей. */
async function loadExistingKeys(db: Db, types: Set<ContentType>): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (types.has('place')) for (const r of await db.select({ slug: places.slug, title: places.title, address: places.address }).from(places)) map.set(duplicateKey('place', r), r.slug);
  if (types.has('event')) for (const r of await db.select({ slug: events.slug, title: events.title, startsAt: events.startsAt, placeId: events.placeId }).from(events)) map.set(duplicateKey('event', { title: r.title, startsAt: r.startsAt, placeRef: r.placeId }), r.slug);
  if (types.has('activity')) for (const r of await db.select({ slug: activities.slug, title: activities.title }).from(activities)) map.set(duplicateKey('activity', r), r.slug);
  return map;
}
