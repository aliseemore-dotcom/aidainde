import { beforeAll, describe, expect, it } from 'vitest';
import { createMemoryDb, type Db } from '@/db/client';
import { seedDemo } from '@/db/seed-demo';
import { seedTags, createContent } from '@/features/catalog/mutations';
import { parseImport, runImport } from '@/features/catalog/import';
import { launchProblems } from '@/features/catalog/launch-check';
import { classifyAttention, loadAttention } from '@/features/catalog/attention';
import { readMetrics, recordMetrics } from '@/features/results/metrics';
import { completeQuiz, type Ctx } from '@/features/results/service';
import { metricsDaily } from '@/db/schema';

const NOW = new Date('2026-10-12T09:00:00Z');
const ADMIN = '00000000-0000-0000-0000-00000000000f';
const ctx: Ctx = { now: NOW, allowDemo: true, secret: 'tools-secret-tools-secret' };
const day = 86_400_000;
let db: Db;

beforeAll(async () => { db = await createMemoryDb(); await seedTags(db); });

const place = (o: Record<string, unknown> = {}) => ({
  type: 'place', slug: 'real-place', title: 'Настоящее место', description: 'Описание настоящего места из первоисточника.',
  address: 'ул. Реальная, 5', sourceUrl: 'https://example.org/place', tags: ['venues'], ...o,
});

describe('импорт каталога', () => {
  it('принимает корректные записи как черновики и не публикует сам', async () => {
    const { records, issues } = parseImport([place(), { type: 'activity', slug: 'real-idea', title: 'Идея вечера', description: 'Описание идеи вечера дома.', tags: ['home'] }]);
    expect(issues).toEqual([]);
    expect(records.every((r) => r.data.status === 'draft')).toBe(true);
    const res = await runImport(db, records, ADMIN);
    expect(res).toMatchObject({ created: 2, skipped: [] });
  });

  it('заглушки [ЦЕНА], демо и дубликаты в файле отклоняются', () => {
    const { records, issues } = parseImport([
      place({ slug: 'a', title: '[НАЗВАНИЕ МЕСТА]' }), place({ slug: 'b', priceMin: '[ЦЕНА]' }),
      place({ slug: 'c', isDemo: true }), place({ slug: 'd' }), place({ slug: 'd' }),
    ]);
    expect(records.map((r) => r.data.slug)).toEqual(['d']);
    expect(issues.map((i) => i.message).join('|')).toMatch(/заглушки.*заглушки.*Демо.*Повторяется/s);
  });

  it('невалидные записи и не-массив дают понятные ошибки', () => {
    expect(parseImport({}).issues[0]!.message).toMatch(/массив/);
    const r = parseImport([{ foo: 1 }, place({ slug: 'Bad Slug' }), place({ slug: 'neg', priceMin: -1 }), place({ slug: 'bad-tag', tags: ['zzz'] }), place({ slug: 'js', sourceUrl: 'javascript:alert(1)' })]);
    expect(r.records).toEqual([]);
    expect(r.issues).toHaveLength(5);
  });

  it('повторный импорт пропускает занятые slug; --publish не публикует непроверенное событие', async () => {
    const again = await runImport(db, parseImport([place()]).records, ADMIN);
    expect(again.created).toBe(0);
    expect(again.skipped[0]!.message).toMatch(/уже есть/);
    const ev = { type: 'event', slug: 'real-ev', title: 'Настоящее событие', description: 'Описание настоящего события.', startsAt: '2026-11-01T16:00:00Z', sourceUrl: 'https://example.org/e', tags: ['culture'] };
    const res = await runImport(db, parseImport([ev]).records, ADMIN, { publish: true });
    expect(res.created).toBe(0);
    expect(res.skipped[0]!.message).toMatch(/verifiedAt/);
  });
});

describe('проверка перед запуском', () => {
  it('находит демо, пустой каталог и записи без даты проверки', async () => {
    const empty = await createMemoryDb();
    await seedTags(empty);
    expect((await launchProblems(empty)).map((p) => p.code)).toEqual(['empty_catalog']);
    await seedDemo(empty, NOW);
    expect((await launchProblems(empty)).map((p) => p.code)).toEqual(expect.arrayContaining(['demo_present', 'empty_catalog']));
  });

  it('чистый каталог проходит', async () => {
    const clean = await createMemoryDb();
    await seedTags(clean);
    await createContent(clean, 'place', { ...place({ slug: 'ok-place', status: 'published', verifiedAt: NOW.toISOString() }), type: undefined }, ADMIN);
    expect(await launchProblems(clean)).toEqual([]);
    await createContent(clean, 'place', { ...place({ slug: 'unverified', status: 'published' }), type: undefined }, ADMIN);
    expect((await launchProblems(clean)).map((p) => p.code)).toEqual(['place_unverified']);
  });
});

describe('«Требует внимания»', () => {
  const ev = (o: Partial<Parameters<typeof classifyAttention>[0][number]> = {}) => ({ id: 'e1', title: 'Событие', startsAt: new Date(NOW.getTime() + 3 * day), endsAt: null, verifiedAt: new Date(NOW.getTime() - 2 * day), occ: [], ...o });

  it('классифицирует события и места', () => {
    expect(classifyAttention([ev()], [], NOW)).toEqual([]);
    expect(classifyAttention([ev({ verifiedAt: new Date(NOW.getTime() - 20 * day) })], [], NOW)[0]!.code).toBe('event_stale_check');
    expect(classifyAttention([ev({ verifiedAt: null })], [], NOW)[0]!.code).toBe('event_stale_check');
    expect(classifyAttention([ev({ startsAt: new Date(NOW.getTime() - 5 * day) })], [], NOW)[0]!.code).toBe('event_finished');
    // у повторяющегося события есть будущий сеанс — не завершено
    expect(classifyAttention([ev({ startsAt: new Date(NOW.getTime() - 5 * day), occ: [{ startsAt: new Date(NOW.getTime() + day), endsAt: null }] })], [], NOW)).toEqual([]);
    const places = classifyAttention([], [{ id: 'p1', title: 'А', verifiedAt: null }, { id: 'p2', title: 'Б', verifiedAt: new Date(NOW.getTime() - 200 * day) }, { id: 'p3', title: 'В', verifiedAt: new Date(NOW.getTime() - 10 * day) }], NOW);
    expect(places.map((p) => p.code)).toEqual(['place_unverified', 'place_stale_check']);
  });

  it('читает данные из БД', async () => {
    const d = await createMemoryDb();
    await seedTags(d);
    await createContent(d, 'place', { ...place({ slug: 'att', status: 'published' }), type: undefined }, ADMIN);
    expect((await loadAttention(d, NOW)).map((a) => a.code)).toEqual(['place_unverified']);
  });
});

describe('приватные счётчики', () => {
  it('считают по дням без персональных данных и не ломают ответ при сбое записи', async () => {
    const d = await createMemoryDb();
    await seedTags(d); await seedDemo(d, NOW);
    const answers = { socialEnergy: 'high', companion: 'group', mood: 'excitement', setting: 'indoor', direction: 'games', branchAnswers: { G1: 'mind', G2_MIND: 'quiz', G3: 'friendly' }, dayChoice: 'weekend', budgetTier: 'mid', budgetBasis: 'per_person', partySize: 6 };
    await completeQuiz(d, { schemaVersion: 1, quizType: 'main', answers }, ctx);
    await completeQuiz(d, { schemaVersion: 1, quizType: 'main', answers }, ctx);
    const m = await readMetrics(d, NOW);
    expect(m.totals).toMatchObject({ quiz_completed: 2, 'direction:games': 2, 'setting:indoor': 2, 'companion:group': 2 });
    const rows = await d.select().from(metricsDaily);
    expect(JSON.stringify(rows)).not.toMatch(/token|answers|ip|ua/i);
    // сбой записи (например, закрытая БД) проглатывается
    const broken = { insert: () => { throw new Error('db down'); } } as unknown as Db;
    await expect(recordMetrics(broken, ['x'], NOW)).resolves.toBeUndefined();
  });

  it('окно в 14 дней не включает старые данные', async () => {
    const d = await createMemoryDb();
    await recordMetrics(d, ['quiz_completed'], new Date(NOW.getTime() - 30 * day));
    await recordMetrics(d, ['quiz_completed'], NOW);
    expect((await readMetrics(d, NOW)).totals.quiz_completed).toBe(1);
  });
});

describe('таблица → импорт → БД', () => {
  it('места, затем события с привязкой к месту по slug; неизвестная площадка пропускается с понятной причиной', async () => {
    const { csvToRecords } = await import('@/features/catalog/csv-import');
    const { COLUMNS } = await import('@/features/catalog/csv-schema');
    const { places, events } = await import('@/db/schema');
    const d = await createMemoryDb();
    await seedTags(d);
    const q = (x: string) => (/[;"\n]/.test(x) ? `"${x.replace(/"/g, '""')}"` : x);
    const csv = (type: 'place' | 'event', vals: Record<string, string>) =>
      [COLUMNS[type].map((c) => c.header).join(';'), COLUMNS[type].map((c) => q(vals[c.header] ?? '')).join(';')].join('\n');

    const pl = csvToRecords('place', csv('place', { 'Название': 'Филармония', 'Описание': 'Концертный зал в центре города.', 'Адрес': 'ул. Пример, 1', 'Источник (ссылка)': 'https://example.org/f', 'Дата проверки': '12.10.2026', 'Теги': 'Культура' }));
    expect(pl.issues).toEqual([]);
    const placeParsed = parseImport(pl.records);
    expect((await runImport(d, placeParsed.records, ADMIN)).created).toBe(1);

    const ev = (slug: string) => csvToRecords('event', csv('event', { 'Название': 'Вечерний концерт', 'Описание': 'Концерт камерной музыки.', 'Площадка (slug места)': slug, 'Начало': '17.10.2026 19:00', 'Источник (ссылка)': 'https://example.org/e', 'Дата проверки': '12.10.2026', 'Теги': 'Культура' }));
    const ok = await runImport(d, parseImport(ev('filarmoniya').records).records, ADMIN);
    expect(ok.created).toBe(1);
    const [stored] = await d.select().from(events);
    const [place] = await d.select().from(places);
    expect(stored!.placeId).toBe(place!.id);
    expect(stored!.status).toBe('draft'); // импорт сам не публикует
    expect(stored!.startsAt.toISOString()).toBe('2026-10-17T16:00:00.000Z');

    const missing = await runImport(d, parseImport([{ ...ev('net-takoy').records[0]!, slug: 'ev-2' }]).records, ADMIN);
    expect(missing.created).toBe(0);
    expect(missing.skipped[0]!.message).toMatch(/Площадка «net-takoy» не найдена/);
  });
});
