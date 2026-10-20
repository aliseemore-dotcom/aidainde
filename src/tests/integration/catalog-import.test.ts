import { beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { createMemoryDb, type Db } from '@/db/client';
import { eventOccurrences, events, places, tags } from '@/db/schema';
import { seedTags } from '@/features/catalog/mutations';
import { allowedFields, parseImport, runImport } from '@/features/catalog/import';
import { duplicateKey, normAddress, normTitle } from '@/features/catalog/duplicates';
import { PLACE_KINDS, placeKindLabel } from '@/features/catalog/place-kinds';
import { getContentBySlug, listCatalog } from '@/features/catalog/queries';
import { publicView } from '@/features/catalog/public';
import { catalogQuery } from '@/features/catalog/validators';
import { DIRECTION_TAGS, TAGS, TAG_KEYS } from '@/features/recommend/tag-registry';
import { NEIGHBOR_DIRECTIONS, SOCIAL_ENERGY_TAG } from '@/features/recommend/tag-map';
import { COLUMNS } from '@/features/catalog/csv-schema';

const ADMIN = '00000000-0000-0000-0000-00000000000f';
const HOSTS = { imageHosts: ['img.example.org'] };
const NOW = new Date('2026-10-12T09:00:00Z');
let db: Db;
beforeAll(async () => { db = await createMemoryDb(); await seedTags(db); });

const place = (o: Record<string, unknown> = {}) => ({
  type: 'place', slug: 'p-base', kind: 'restaurant', title: 'Ресторан Пример', description: 'Описание ресторана для проверки импорта.',
  address: 'ул. Баумана, 1', sourceUrl: 'https://example.org/r', verifiedAt: '2026-10-12T12:00:00+03:00', tags: ['venues', 'venue_food_talk'], ...o,
});
const run = async (items: unknown[], opts: { publish?: boolean } = {}) => runImport(db, parseImport(items, HOSTS).records, ADMIN, opts);

describe('C05: проверки формата импорта', () => {
  it('опечатки и лишние поля не теряются молча: запись отклоняется с названием поля', () => {
    const r = parseImport([place({ websiteURL: 'https://example.org', lattitude: 55 })], HOSTS);
    expect(r.records).toEqual([]);
    expect(r.issues[0]!.message).toContain('«websiteURL»');
    expect(r.issues[0]!.message).toContain('«lattitude»');
  });

  it('допустимые поля берутся из той же схемы, что проверяет запись (без расхождения с руководством)', () => {
    expect(allowedFields('place').has('kind')).toBe(true);
    expect(allowedFields('place').has('placeSlug')).toBe(false);
    expect(allowedFields('event').has('placeSlug')).toBe(true);
    expect(allowedFields('event').has('occurrences')).toBe(true);
    expect(allowedFields('activity').has('stepsRichText')).toBe(true);
  });

  it('статус задаёт команда импорта: «published» в файле не допускается, «draft» можно', async () => {
    expect(parseImport([place({ slug: 'a', status: 'published' })], HOSTS).issues[0]!.message).toMatch(/status/);
    expect(parseImport([place({ slug: 'b', status: 'archived' })], HOSTS).records).toEqual([]);
    expect(parseImport([place({ slug: 'c', status: 'draft' })], HOSTS).records).toHaveLength(1);
    const res = await run([place({ slug: 'st-1', title: 'Ресторан Статус', address: 'ул. Статусная, 1' })]);
    expect(res.created).toBe(1);
    const [row] = await db.select().from(places).where(eq(places.slug, 'st-1'));
    expect(row!.status).toBe('draft');
  });

  it('демо-записи не загружаются ни как черновики, ни с публикацией', async () => {
    const r = parseImport([place({ slug: 'demo-1', isDemo: true })], HOSTS);
    expect(r.records).toEqual([]);
    expect(r.issues[0]!.message).toMatch(/Демо/);
    expect((await run([place({ slug: 'demo-2', isDemo: true })], { publish: true })).created).toBe(0);
  });

  it('изображения: только https и разрешённые домены; без media запись проходит', () => {
    const media = (url: string) => place({ slug: `m-${Math.abs([...url].reduce((a, c) => a + c.charCodeAt(0), 0))}`, media: [{ url, alt: 'Фасад здания', rightsStatus: 'owned' }] });
    expect(parseImport([media('https://img.example.org/a.jpg')], HOSTS).records).toHaveLength(1);
    for (const bad of ['https://other.example.org/a.jpg', 'http://img.example.org/a.jpg', 'javascript:alert(1)', 'data:image/png;base64,AAAA']) {
      const r = parseImport([media(bad)], HOSTS);
      expect(r.records, bad).toEqual([]);
      expect(r.issues[0]!.message).toMatch(/разрешённых/);
    }
    expect(parseImport([media('https://img.example.org/a.jpg')], { imageHosts: [] }).records).toEqual([]); // список доменов пуст
    expect(parseImport([place({ slug: 'nomedia' })], { imageHosts: [] }).records).toHaveLength(1);
  });

  it('обязательные поля и ссылки проверяются; теги — только из словаря', () => {
    const bad = (o: Record<string, unknown>) => parseImport([place({ slug: 'x', ...o })], HOSTS).records.length;
    expect(bad({ title: '' })).toBe(0);
    expect(bad({ address: undefined })).toBe(0);
    expect(bad({ sourceUrl: undefined })).toBe(0);
    expect(bad({ sourceUrl: 'ftp://x' })).toBe(0);
    expect(bad({ tags: ['zzz'] })).toBe(0);
    expect(bad({ kind: 'pizzeria' })).toBe(0);
    expect(bad({ priceMin: -1 })).toBe(0);
    expect(bad({ slug: 'Bad Slug' })).toBe(0);
  });

  it('категории и теги сохраняются в БД', async () => {
    await run([place({ slug: 'tg-1', title: 'Ресторан Теги', address: 'ул. Тегов, 2', tags: ['venues', 'venue_quiet', 'mood_relax', 'company_friend', 'energy_low', 'load_sit'] })]);
    const d = await getContentBySlug(db, 'place', 'tg-1', { allowDemo: true, includeDraft: true });
    expect(d!.tags.sort()).toEqual(['company_friend', 'energy_low', 'load_sit', 'mood_relax', 'venue_quiet', 'venues']);
  });
});

describe('C05: дубликаты', () => {
  it('нормализация: регистр, ё/е, кавычки, порядок и служебные слова адреса', () => {
    expect(normTitle('Ресторан «Дубль»')).toBe(normTitle('ресторан дубль'));
    expect(normTitle('Тётя Мотя')).toBe(normTitle('Тетя Мотя'));
    expect(normAddress('ул. Баумана, 7')).toBe(normAddress('Баумана ул., д. 7, Казань'));
    expect(normAddress('ул. Баумана, 7')).not.toBe(normAddress('ул. Баумана, 9'));
  });

  it('внутри файла: то же место с другим slug — дубль; сеть по разным адресам — не дубль', () => {
    const r = parseImport([
      place({ slug: 'd-1', title: 'Ресторан Дубль', address: 'ул. Баумана, 7' }),
      place({ slug: 'd-2', title: 'Ресторан «Дубль»', address: 'Баумана ул., д. 7' }),
      place({ slug: 'd-3', title: 'Ресторан Дубль', address: 'ул. Пушкина, 1' }),
    ], HOSTS);
    expect(r.records.map((x) => x.data.slug)).toEqual(['d-1', 'd-3']);
    expect(r.issues[0]!.message).toMatch(/Дубликат записи №1/);
  });

  it('события: то же название и время на той же площадке — дубль; другое время или площадка — нет', () => {
    const ev = (o: Record<string, unknown>) => ({ type: 'event', slug: 'e', title: 'Вечерний концерт', description: 'Описание концерта для проверки.', startsAt: '2026-10-17T19:00:00+03:00', sourceUrl: 'https://example.org/e', verifiedAt: '2026-10-12T12:00:00+03:00', tags: ['culture'], placeSlug: 'filarmoniya', ...o });
    const r = parseImport([ev({ slug: 'e-1' }), ev({ slug: 'e-2', title: 'Вечерний Концерт!' }), ev({ slug: 'e-3', startsAt: '2026-10-18T19:00:00+03:00' }), ev({ slug: 'e-4', placeSlug: 'drugoy-zal' })], HOSTS);
    expect(r.records.map((x) => x.data.slug)).toEqual(['e-1', 'e-3', 'e-4']);
  });

  it('идеи на дом: то же название — дубль', () => {
    const a = (slug: string, title: string) => ({ type: 'activity', slug, title, description: 'Описание идеи для проверки.', tags: ['home'] });
    expect(parseImport([a('i-1', 'Вечер настолок'), a('i-2', 'вечер  настолок!')], HOSTS).records).toHaveLength(1);
  });

  it('с каталогом: запись, уже существующая под другим slug, пропускается с указанием существующей', async () => {
    await run([place({ slug: 'ex-1', title: 'Ресторан Существующий', address: 'ул. Ленина, 10' })]);
    const res = await run([place({ slug: 'ex-2', title: 'Ресторан «Существующий»', address: 'Ленина ул., 10' })]);
    expect(res.created).toBe(0);
    expect(res.skipped[0]!.message).toMatch(/дубликат существующей записи «ex-1»/);
    expect(duplicateKey('place', { title: 'a', address: 'b' })).toBe('place|a|b');
  });
});

describe('C01–C03: места, мероприятия и сеансы в одной структуре', () => {
  it('JSON: места разных типов, затем мероприятие с площадкой, сеансами и билетами; всё как черновики', async () => {
    const items = [
      place({ slug: 'c-rest', kind: 'restaurant', title: 'Ресторан Каталог', address: 'ул. Каталожная, 1', priceMin: 800, priceMax: 2500, priceUnit: 'per_person', openingHoursJson: { 'Пн–Вс': '12:00–23:00' }, contactsJson: { phone: '+7 000 000-00-00' }, websiteUrl: 'https://example.org', lat: 55.79, lng: 49.12 }),
      place({ slug: 'c-museum', kind: 'museum', title: 'Музей Каталог', address: 'ул. Музейная, 2', tags: ['culture', 'culture_visual'] }),
      place({ slug: 'c-cafe', kind: 'cafe', title: 'Кафе Каталог', address: 'ул. Кафейная, 3' }),
      { type: 'event', slug: 'c-event', title: 'Концерт Каталог', description: 'Описание концерта для проверки.', placeSlug: 'c-museum', startsAt: '2026-10-17T19:00:00+03:00', endsAt: '2026-10-17T21:00:00+03:00', expiresAt: '2026-10-18T00:00:00+03:00', priceMin: 700, priceMax: 1500, priceUnit: 'per_person', ageMin: 12, ticketsUrl: 'https://example.org/tickets', sourceUrl: 'https://example.org/event', verifiedAt: '2026-10-12T12:00:00+03:00', tags: ['culture', 'culture_story'], occurrences: [{ startsAt: '2026-10-24T19:00:00+03:00', status: 'published', ticketsUrl: 'https://example.org/tickets2' }] },
    ];
    const parsed = parseImport(items, HOSTS);
    expect(parsed.issues).toEqual([]);
    const res = await runImport(db, parsed.records, ADMIN);
    expect(res).toMatchObject({ created: 4, skipped: [] });

    const [museum] = await db.select().from(places).where(eq(places.slug, 'c-museum'));
    const [ev] = await db.select().from(events).where(eq(events.slug, 'c-event'));
    expect(ev!.placeId).toBe(museum!.id); // мероприятие связано с площадкой
    expect(ev!.status).toBe('draft');
    expect(ev!.ageMin).toBe(12);
    expect(ev!.ticketsUrl).toBe('https://example.org/tickets');
    expect(ev!.verifiedAt!.toISOString()).toBe('2026-10-12T09:00:00.000Z');
    expect(ev!.startsAt.toISOString()).toBe('2026-10-17T16:00:00.000Z');
    const occ = await db.select().from(eventOccurrences).where(eq(eventOccurrences.eventId, ev!.id));
    expect(occ).toHaveLength(1); // событие и сеансы остаются разными сущностями
    expect(occ[0]!.startsAt.toISOString()).toBe('2026-10-24T16:00:00.000Z');

    const [rest] = await db.select().from(places).where(eq(places.slug, 'c-rest'));
    expect(rest).toMatchObject({ kind: 'restaurant', priceMin: 800, priceMax: 2500, priceUnit: 'per_person', websiteUrl: 'https://example.org', lat: 55.79, lng: 49.12 });
    expect(rest!.openingHoursJson).toEqual({ 'Пн–Вс': '12:00–23:00' });
    expect(rest!.contactsJson).toEqual({ phone: '+7 000 000-00-00' });
    expect(rest!.verifiedAt).not.toBeNull();
  });

  it('тип места: виден в публичном представлении и в каталоге; без типа — null, старые данные не ломаются', async () => {
    const { createContent } = await import('@/features/catalog/mutations');
    await createContent(db, 'place', { ...place({ slug: 'no-kind', title: 'Без типа', address: 'ул. Безтиповая, 1', status: 'published', kind: undefined }), type: undefined }, ADMIN);
    await createContent(db, 'place', { ...place({ slug: 'with-kind', title: 'С типом', address: 'ул. Типовая, 1', status: 'published', kind: 'bar' }), type: undefined }, ADMIN);
    const noKind = await getContentBySlug(db, 'place', 'no-kind', { allowDemo: false });
    const withKind = await getContentBySlug(db, 'place', 'with-kind', { allowDemo: false });
    expect((publicView(withKind!) as { kind?: string }).kind).toBe('bar');
    expect((publicView(noKind!) as { kind?: string }).kind).toBeUndefined();
    const list = await listCatalog(db, catalogQuery.parse({ type: 'place' }), { allowDemo: false, now: NOW });
    expect(Object.fromEntries(list.items.map((i) => [i.slug, i.kind]))).toMatchObject({ 'with-kind': 'bar', 'no-kind': null });
    expect(placeKindLabel('bar')).toBe('Бар');
    expect(placeKindLabel(null)).toBeNull();
  });

  it('все типы места имеют русское название; ключи уникальны', () => {
    expect(new Set(PLACE_KINDS.map((k) => k.key)).size).toBe(PLACE_KINDS.length);
    expect(new Set(PLACE_KINDS.map((k) => k.label)).size).toBe(PLACE_KINDS.length);
    expect(PLACE_KINDS.map((k) => k.key)).toEqual(expect.arrayContaining(['restaurant', 'cafe', 'bar', 'museum', 'theatre']));
    expect(COLUMNS.place.some((c) => c.key === 'kind')).toBe(true);
  });
});

describe('C04: словарь тегов совместим с подбором', () => {
  it('все ключи, которые подбор строит из ответов, есть в реестре, который видят каталог и админка', () => {
    const dynamic = [
      ...['excitement', 'discovery', 'relax', 'connection', 'surprise'].map((m) => `mood_${m}`),
      ...['solo', 'friend', 'group', 'family', 'partner'].map((c) => `company_${c}`),
      ...Object.values(SOCIAL_ENERGY_TAG).filter((x): x is string => !!x),
      ...Object.values(NEIGHBOR_DIRECTIONS).flat(),
      ...DIRECTION_TAGS,
      'adult_only', 'car_required',
    ];
    for (const k of dynamic) expect(TAG_KEYS.has(k), k).toBe(true);
  });

  it('есть теги для всех нужных осей классификации', () => {
    const groups = new Set(TAGS.map((t) => t.group));
    for (const g of ['category', 'mood', 'company', 'energy', 'physicalLoad', 'accessibility', 'gameStyle', 'competitionMode', 'format']) expect(groups.has(g as never), g).toBe(true);
    // формат помещения хранится колонкой indoorOutdoor (улица / внутри / и то и другое), дома — отдельный тип идей
    expect(Object.keys(places)).toContain('indoorOutdoor');
  });

  it('таблица tags в БД заполняется ровно реестром (параллельного словаря нет)', async () => {
    const rows = await db.select().from(tags);
    expect(rows.map((r) => r.key).sort()).toEqual(TAGS.map((t) => t.key).sort());
  });
});
