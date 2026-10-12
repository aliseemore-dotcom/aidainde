import { z } from 'zod';
import type { Db } from '@/db/client';
import { createContent, PublishError, SlugTakenError } from './mutations';
import { inputByType } from './validators';
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

/** Проверяет файл целиком, ничего не записывая. */
export function parseImport(json: unknown): { records: ParsedRecord[]; issues: ImportIssue[] } {
  const issues: ImportIssue[] = [];
  const records: ParsedRecord[] = [];
  if (!Array.isArray(json)) return { records, issues: [{ index: -1, message: 'Ожидается JSON-массив записей' }] };
  const seen = new Set<string>();
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
    // по умолчанию — черновик: публикует человек в админке после проверки
    const data = { status: 'draft', isDemo: false, ...rest };
    const parsed = inputByType[type].safeParse(data);
    if (!parsed.success) {
      issues.push({ index, slug, message: parsed.error.issues.map((i) => `${i.path.join('.') || 'запись'}: ${i.message}`).join('; ') });
      return;
    }
    records.push({ index, type, data });
  });
  return { records, issues };
}

export interface ImportResult { created: number; skipped: ImportIssue[] }

/** Записывает проверенные записи. Не публикует, пока явно не передано publish. Конфликты slug пропускаются. */
export async function runImport(db: Db, records: ParsedRecord[], adminUserId: string, opts: { publish?: boolean } = {}): Promise<ImportResult> {
  let created = 0;
  const skipped: ImportIssue[] = [];
  for (const r of records) {
    const slug = typeof r.data.slug === 'string' ? r.data.slug : undefined;
    try {
      await createContent(db, r.type, opts.publish ? { ...r.data, status: 'published' } : r.data, adminUserId);
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
