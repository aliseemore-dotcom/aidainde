import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { Db } from './client';
import { places } from './schema';
import { parseImport, runImport } from '@/features/catalog/import';

const SYSTEM_ADMIN = '00000000-0000-0000-0000-00000000000f';
const read = (name: string): unknown => JSON.parse(readFileSync(path.join(process.cwd(), 'content', 'preview', name), 'utf8'));

export interface PreviewSeedReport { places: number; events: number; eventsWithoutVenue: number; skipped: string[] }

/**
 * Данные для тестирования MVP: заведения и события из подготовленных файлов `content/preview/*.json`,
 * загружаются черновиками (формат и проверки те же, что у боевого импорта).
 * Только для локальной БД в режиме предпросмотра (PREVIEW_DRAFTS) и никогда в production.
 * События, чья площадка ещё не загружена, попадают без привязки к площадке: в боевом импорте их бы пропустили.
 */
export async function seedPreview(db: Db): Promise<PreviewSeedReport> {
  const skipped: string[] = [];
  const pl = await runImport(db, parseImport(read('places-69.json')).records, SYSTEM_ADMIN);
  skipped.push(...pl.skipped.map((s) => `${s.slug}: ${s.message}`));

  const have = new Set((await db.select({ slug: places.slug }).from(places)).map((p) => p.slug));
  let withoutVenue = 0;
  const events = (read('events-64.json') as Record<string, unknown>[]).map((e) => {
    if (typeof e.placeSlug === 'string' && !have.has(e.placeSlug)) { withoutVenue++; const { placeSlug: _drop, ...rest } = e; void _drop; return rest; }
    return e;
  });
  const ev = await runImport(db, parseImport(events).records, SYSTEM_ADMIN);
  skipped.push(...ev.skipped.map((s) => `${s.slug}: ${s.message}`));
  return { places: pl.created, events: ev.created, eventsWithoutVenue: withoutVenue, skipped };
}
