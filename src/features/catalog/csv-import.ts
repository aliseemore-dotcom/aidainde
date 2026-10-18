import { COLUMNS, type Col } from './csv-schema';
import { parseCsv } from './csv';
import { slugify, uniqueSlug } from './slug';
import { TAGS } from '@/features/recommend/tag-registry';
import { KAZAN_UTC_OFFSET } from '@/lib/date-kazan';
import type { ContentType } from '@/features/recommend/types';

export interface CsvIssue { row: number; column?: string; message: string }

const norm = (s: string) => s.toLowerCase().replace(/ё/g, 'е').replace(/[*\s]+/g, ' ').trim();

const TAG_BY_NAME = new Map<string, string>();
for (const t of TAGS) { TAG_BY_NAME.set(norm(t.label), t.key); TAG_BY_NAME.set(norm(t.key), t.key); }

const PRICE_UNIT: Record<string, string> = { 'с человека': 'per_person', 'за человека': 'per_person', 'за всех': 'total', 'за компанию': 'total', 'неизвестно': 'unknown', '': 'unknown' };
const SETTING: Record<string, string> = { 'в помещении': 'indoor', 'на улице': 'outdoor', 'и там и там': 'both', 'и то и другое': 'both', 'неизвестно': 'unknown', '': 'unknown' };
const TRI: Record<string, boolean | null> = { 'да': true, 'нет': false, 'неизвестно': null, '': null };

class CellError extends Error {}

function pad(n: string) { return n.padStart(2, '0'); }

/** «17.10.2026», «17.10.2026 19:00» или ISO -> ISO (UTC); время трактуется по Казани. */
export function parseKazanDate(raw: string, withTime: boolean): string {
  const v = raw.trim();
  const ru = /^(\d{1,2})\.(\d{1,2})\.(\d{4})(?:[ T](\d{1,2}):(\d{2}))?$/.exec(v);
  const iso8601 = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{1,2}):(\d{2}))?$/.exec(v);
  const parts = ru ? { y: ru[3]!, mo: ru[2]!, d: ru[1]!, h: ru[4], mi: ru[5] } : iso8601 ? { y: iso8601[1]!, mo: iso8601[2]!, d: iso8601[3]!, h: iso8601[4], mi: iso8601[5] } : null;
  if (!parts) throw new CellError(withTime ? 'ожидается ДД.ММ.ГГГГ ЧЧ:ММ' : 'ожидается ДД.ММ.ГГГГ');
  if (withTime && parts.h === undefined) throw new CellError('укажите время: ДД.ММ.ГГГГ ЧЧ:ММ');
  const day = `${parts.y}-${pad(parts.mo)}-${pad(parts.d)}`;
  const date = new Date(`${day}T${pad(parts.h ?? '12')}:${parts.mi ?? '00'}:00${KAZAN_UTC_OFFSET}`);
  // сверяем календарный день по Казани: отсекает 31.02 и 25:00
  if (Number.isNaN(date.getTime()) || !new Date(date.getTime() + 3 * 3600_000).toISOString().startsWith(day)) throw new CellError('такой даты или времени не существует');
  return date.toISOString();
}

function convert(col: Col, raw: string): unknown {
  const v = raw.trim();
  switch (col.kind) {
    case 'text': case 'long': return v === '' ? null : v;
    case 'number': {
      if (v === '') return null;
      const n = Number(v.replace(/[\s₽р.]+$/i, '').replace(/\s/g, '').replace(',', '.'));
      if (!Number.isFinite(n)) throw new CellError('ожидается число');
      return col.key === 'lat' || col.key === 'lng' ? n : Math.round(n);
    }
    case 'url': {
      if (v === '') return null;
      if (/^https?:\/\//i.test(v)) return v;
      if (/^[\w-]+(\.[\w-]+)+(\/\S*)?$/.test(v)) return `https://${v}`;
      throw new CellError('ожидается ссылка, например https://example.com');
    }
    case 'date': return v === '' ? null : parseKazanDate(v, false);
    case 'datetime': return v === '' ? null : parseKazanDate(v, true);
    case 'priceUnit': { const r = PRICE_UNIT[norm(v)]; if (!r) throw new CellError('допустимо: с человека / за всех / неизвестно'); return r; }
    case 'setting': { const r = SETTING[norm(v)]; if (!r) throw new CellError('допустимо: в помещении / на улице / и там и там / неизвестно'); return r; }
    case 'tri': { const k = norm(v); if (!(k in TRI)) throw new CellError('допустимо: да / нет / неизвестно'); return TRI[k]; }
    case 'list': return v === '' ? [] : v.split(/[;\n]/).map((x) => x.trim()).filter(Boolean);
    case 'hours': {
      if (v === '') return null;
      const entries = v.split(/[;\n]/).map((x) => x.trim()).filter(Boolean).map((l) => { const i = l.indexOf(':'); if (i < 1) throw new CellError('ожидается «Пн–Пт: 10:00–22:00; Сб: 11:00–20:00»'); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] as const; });
      return Object.fromEntries(entries);
    }
    case 'tags': {
      const names = v.split(/[;\n]/).map((x) => x.trim()).filter(Boolean);
      const keys: string[] = []; const unknown: string[] = [];
      for (const n of names) { const k = TAG_BY_NAME.get(norm(n)); if (k) { if (!keys.includes(k)) keys.push(k); } else unknown.push(n); }
      if (unknown.length) {
        const hints = unknown.map((u) => { const near = TAGS.filter((t) => norm(t.label).includes(norm(u)) || norm(u).includes(norm(t.label))).map((t) => t.label).slice(0, 2); return near.length ? `«${u}» (возможно: ${near.join(', ')})` : `«${u}»`; });
        throw new CellError(`неизвестные теги: ${hints.join('; ')}. Используйте названия из листа «Теги»`);
      }
      return keys;
    }
  }
}

export interface CsvConversion { records: Record<string, unknown>[]; issues: CsvIssue[]; skippedExamples: number }

/**
 * Таблица -> записи для импорта. Ничего не пишет и не выдумывает: пустые обязательные поля — ошибка со строкой и колонкой.
 * Строки, где в названии «ПРИМЕР…», пропускаются.
 */
export function csvToRecords(type: ContentType, text: string, opts: { takenSlugs?: Set<string> } = {}): CsvConversion {
  const rows = parseCsv(text);
  const issues: CsvIssue[] = []; const records: Record<string, unknown>[] = [];
  if (rows.length === 0) return { records, issues: [{ row: 1, message: 'Файл пустой' }], skippedExamples: 0 };
  const cols = COLUMNS[type];
  const byHeader = new Map(cols.map((c) => [norm(c.header), c]));
  const header = rows[0]!;
  const map: (Col | undefined)[] = header.map((h) => byHeader.get(norm(h)));
  const missing = cols.filter((c) => c.required && !map.includes(c));
  if (missing.length) return { records, issues: [{ row: 1, message: `Нет обязательных колонок: ${missing.map((m) => m.header).join(', ')}. Используйте шаблон.` }], skippedExamples: 0 };
  header.forEach((h, i) => { if (h.trim() && !map[i]) issues.push({ row: 1, column: h, message: 'Неизвестная колонка — будет проигнорирована' }); });

  const slugs = opts.takenSlugs ?? new Set<string>();
  let skippedExamples = 0;
  rows.slice(1).forEach((cells, idx) => {
    const row = idx + 2;
    if (cells.every((x) => x.trim() === '')) return;
    const titleCol = map.findIndex((c) => c?.key === 'title');
    if (/^пример/i.test((cells[titleCol] ?? '').trim())) { skippedExamples++; return; }
    const rec: Record<string, unknown> = {};
    let ok = true;
    map.forEach((col, i) => {
      if (!col) return;
      try {
        const val = convert(col, cells[i] ?? '');
        if (col.required && (val == null || (Array.isArray(val) && !val.length))) throw new CellError('обязательное поле пусто');
        rec[col.key] = val;
      } catch (e) {
        if (!(e instanceof CellError)) throw e;
        ok = false; issues.push({ row, column: col.header, message: e.message });
      }
    });
    if (!ok) return;
    // контакты места собираем в один объект
    if (type === 'place' && (rec.phone || rec.email)) rec.contactsJson = { ...(rec.phone ? { phone: rec.phone } : {}), ...(rec.email ? { email: rec.email } : {}) };
    delete rec.phone; delete rec.email;
    if (type === 'activity') { rec.requiredMaterialsJson = rec.requiredMaterials; delete rec.requiredMaterials; }
    if (type === 'place') { rec.openingHoursJson = rec.openingHours; delete rec.openingHours; }
    rec.slug = rec.slug ? uniqueSlug(String(rec.slug), slugs) : uniqueSlug(slugify(String(rec.title)), slugs);
    for (const k of Object.keys(rec)) if (rec[k] === null && k !== 'priceMin' && k !== 'priceMax' && k !== 'costMin' && k !== 'costMax') delete rec[k];
    records.push({ type, ...rec });
  });
  return { records, issues, skippedExamples };
}
