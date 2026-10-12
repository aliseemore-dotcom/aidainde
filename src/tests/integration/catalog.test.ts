import { beforeAll, describe, expect, it } from 'vitest';
import { createMemoryDb, type Db } from '@/db/client';
import { seedDemo } from '@/db/seed-demo';
import { seedTags, createContent, updateContent, unpublishContent, deleteContent, PublishError, SlugTakenError } from '@/features/catalog/mutations';
import { getContentBySlug, listCatalog, loadCandidates, listPublicSlugs } from '@/features/catalog/queries';
import { catalogQuery } from '@/features/catalog/validators';
import { recommend } from '@/features/recommend/engine';
import { finalizeAnswers } from '@/features/quiz/graph';
import { validateComplete } from '@/features/quiz/schema';
import { resolveDayChoice } from '@/lib/date-kazan';
import { auditLog, tags } from '@/db/schema';
import type { QuizAnswers } from '@/features/quiz/types';
import type { FinalAnswers } from '@/features/recommend/types';
import { TAGS } from '@/features/recommend/tag-registry';

const NOW = new Date('2026-10-12T09:00:00Z'); // пн
const ADMIN = '11111111-1111-1111-1111-111111111111';
let db: Db;

beforeAll(async () => {
  db = await createMemoryDb();
  await seedTags(db);
  await seedDemo(db, NOW);
});

const q = (o: Record<string, unknown> = {}) => catalogQuery.parse(o);

/** Прогоняет ответы теста тем же путём, что и API: валидация -> finalize -> каталог -> движок. */
async function run(a: QuizAnswers, allowDemo = true) {
  const v = validateComplete(a);
  if (!v.ok) throw new Error(JSON.stringify(v.issues));
  const f = finalizeAnswers(v.answers) as unknown as FinalAnswers;
  return recommend({
    answers: f, range: resolveDayChoice(f.dayChoice, NOW, f.targetDate), now: NOW,
    candidates: await loadCandidates(db, { allowDemo }), allowDemo,
  });
}

describe('БД и сид', () => {
  it('реестр тегов целиком записан в таблицу', async () => {
    expect((await db.select().from(tags)).length).toBe(TAGS.length);
  });

  it('повторный seedTags идемпотентен', async () => {
    await seedTags(db);
    expect((await db.select().from(tags)).length).toBe(TAGS.length);
  });
});

describe('публичный каталог', () => {
  it('отдаёт опубликованное, фильтрует по категории, цене и тексту', async () => {
    const all = await listCatalog(db, q({ type: 'place' }), { allowDemo: true, now: NOW });
    expect(all.total).toBeGreaterThanOrEqual(9);
    const games = await listCatalog(db, q({ type: 'place', category: 'games' }), { allowDemo: true, now: NOW });
    expect(games.items.every((i) => i.tags.includes('games'))).toBe(true);
    expect(games.total).toBeLessThan(all.total);
    const cheap = await listCatalog(db, q({ type: 'place', priceMax: 0 }), { allowDemo: true, now: NOW });
    expect(cheap.items.length).toBeGreaterThan(0);
    expect(cheap.items.every((i) => i.priceMin === 0)).toBe(true); // неизвестная цена в «бесплатно» не попадает
    const found = await listCatalog(db, q({ type: 'place', q: 'музей' }), { allowDemo: true, now: NOW });
    expect(found.items.map((i) => i.slug)).toContain('demo-muzey');
  });

  it('demo не виден, когда демо выключено (production)', async () => {
    expect((await listCatalog(db, q({ type: 'place' }), { allowDemo: false, now: NOW })).total).toBe(0);
    expect(await getContentBySlug(db, 'place', 'demo-muzey', { allowDemo: false })).toBeNull();
    expect(await getContentBySlug(db, 'place', 'demo-muzey', { allowDemo: true })).not.toBeNull();
    const slugs = await listPublicSlugs(db, { allowDemo: false });
    expect(slugs.places.length + slugs.events.length + slugs.activities.length).toBe(0);
  });

  it('события: только предстоящие; отменённое остаётся в каталоге со своим статусом', async () => {
    const list = await listCatalog(db, q({ type: 'event' }), { allowDemo: true, now: NOW });
    const bySlug = Object.fromEntries(list.items.map((i) => [i.slug, i.status]));
    expect(bySlug['demo-koncert']).toBe('published');
    expect(bySlug['demo-otmenennoe']).toBe('cancelled');
    const sat = await listCatalog(db, q({ type: 'event', date: '2026-10-17' }), { allowDemo: true, now: NOW });
    expect(sat.items.length).toBeGreaterThanOrEqual(2);
    const mon = await listCatalog(db, q({ type: 'event', date: '2026-10-13' }), { allowDemo: true, now: NOW });
    expect(mon.items).toHaveLength(0);
  });

  it('поиск безопасен для спецсимволов LIKE', async () => {
    const r = await listCatalog(db, q({ type: 'place', q: '%' }), { allowDemo: true, now: NOW });
    expect(r.total).toBe(0);
  });

  it('пагинация', async () => {
    const p1 = await listCatalog(db, q({ type: 'place', pageSize: 4, page: 1 }), { allowDemo: true, now: NOW });
    const p2 = await listCatalog(db, q({ type: 'place', pageSize: 4, page: 2 }), { allowDemo: true, now: NOW });
    expect(p1.items).toHaveLength(4);
    expect(p1.items.map((i) => i.id)).not.toEqual(p2.items.map((i) => i.id));
  });

  it('валидация запроса: неизвестная категория и тип отклоняются', () => {
    expect(catalogQuery.safeParse({ category: 'nope' }).success).toBe(false);
    expect(catalogQuery.safeParse({ type: 'drop' }).success).toBe(false);
    expect(catalogQuery.safeParse({ pageSize: 9999 }).success).toBe(false);
  });
});

describe('админские операции и публикация', () => {
  const place = (o: Record<string, unknown> = {}) => ({
    slug: 'test-place', title: 'Тестовое место', description: 'Описание тестового места для проверки.',
    address: 'Адрес 1', sourceUrl: 'https://example.com/p', status: 'draft', tags: ['walks'], isDemo: true, ...o,
  });

  it('черновик невидим публично, виден в превью; публикация открывает; снятие скрывает', async () => {
    const id = await createContent(db, 'place', place(), ADMIN);
    expect(await getContentBySlug(db, 'place', 'test-place', { allowDemo: true })).toBeNull();
    expect(await getContentBySlug(db, 'place', 'test-place', { allowDemo: true, includeDraft: true })).not.toBeNull();
    await updateContent(db, 'place', id, place({ status: 'published' }), ADMIN);
    expect(await getContentBySlug(db, 'place', 'test-place', { allowDemo: true })).not.toBeNull();
    await unpublishContent(db, 'place', id, ADMIN);
    expect(await getContentBySlug(db, 'place', 'test-place', { allowDemo: true })).toBeNull();
    expect(await deleteContent(db, 'place', id, ADMIN)).toBe(true);
    const log = await db.select().from(auditLog);
    expect(log.map((l) => l.action)).toEqual(expect.arrayContaining(['create', 'update', 'unpublish', 'delete']));
  });

  it('публикация без обязательных полей отклоняется с понятными проблемами', async () => {
    await expect(createContent(db, 'place', place({ slug: 'no-dir', status: 'published', tags: ['mood_relax'] }), ADMIN)).rejects.toBeInstanceOf(PublishError);
    const ev = {
      slug: 'ev-unverified', title: 'Событие без проверки', description: 'Описание события для проверки.', status: 'published',
      startsAt: '2026-10-20T16:00:00Z', sourceUrl: 'https://example.com/e', tags: ['culture'], isDemo: true,
    };
    await expect(createContent(db, 'event', ev, ADMIN)).rejects.toMatchObject({ issues: [{ field: 'verifiedAt' }] });
    await expect(createContent(db, 'event', { ...ev, verifiedAt: '2026-10-12T09:00:00Z' }, ADMIN)).resolves.toBeTruthy();
  });

  it('повторный slug, неизвестный тег, не-http ссылка и очевидный мусор отклоняются', async () => {
    await createContent(db, 'place', place({ slug: 'dup' }), ADMIN);
    await expect(createContent(db, 'place', place({ slug: 'dup' }), ADMIN)).rejects.toBeInstanceOf(SlugTakenError);
    await expect(createContent(db, 'place', place({ slug: 'bad-tag', tags: ['walks', 'zzz'] }), ADMIN)).rejects.toThrow();
    await expect(createContent(db, 'place', place({ slug: 'bad-url', sourceUrl: 'javascript:alert(1)' }), ADMIN)).rejects.toThrow();
    await expect(createContent(db, 'place', place({ slug: 'Bad Slug!' }), ADMIN)).rejects.toThrow();
    await expect(createContent(db, 'place', place({ slug: 'neg', priceMin: -5 }), ADMIN)).rejects.toThrow();
  });

  it('изображение без подтверждённых прав публично не отдаётся', async () => {
    await createContent(db, 'place', place({
      slug: 'with-media', status: 'published',
      media: [
        { url: 'https://img.example.com/a.jpg', alt: 'Фасад здания', rightsStatus: 'owned' },
        { url: 'https://img.example.com/b.jpg', alt: 'Неизвестные права', rightsStatus: 'unknown' },
      ],
    }), ADMIN);
    const d = await getContentBySlug(db, 'place', 'with-media', { allowDemo: true });
    expect(d!.media.map((m) => m.alt)).toEqual(['Фасад здания']);
  });
});

describe('сценарии из спецификации (§14) от каталога до подборки', () => {
  const slugs = (r: Awaited<ReturnType<typeof run>>) => r.items.map((i) => i.id);
  const bySlug = async () => {
    const c = await loadCandidates(db, { allowDemo: true });
    return Object.fromEntries(c.map((x) => [x.slug, x.id]));
  };

  it('один человек → тихая прогулка → сегодня → бесплатно: outdoor-карточки, без заведений', async () => {
    const r = await run({
      socialEnergy: 'low', companion: 'solo', mood: 'relax', setting: 'outside', direction: 'walks',
      branchAnswers: { W1: 'scenic', W2: 'near' }, dayChoice: 'today', budgetTier: 'free',
    });
    const ids = await bySlug();
    expect(slugs(r)).toContain(ids['demo-naberezhnaya']);
    expect(slugs(r)).not.toContain(ids['demo-kofeynya']);
    expect(r.items[0]!.notes).toContain('check_weather');
  });

  it('компания 6 → игры → интеллект → квиз → дружеский азарт → выходные → до 3000 на человека', async () => {
    const r = await run({
      socialEnergy: 'high', companion: 'group', mood: 'excitement', setting: 'indoor', direction: 'games',
      branchAnswers: { G1: 'mind', G2_MIND: 'quiz', G3: 'friendly' }, dayChoice: 'weekend', budgetTier: 'mid', budgetBasis: 'per_person', partySize: 6,
    });
    const ids = await bySlug();
    expect(r.items[0]!.id).toBe(ids['demo-quiz-bar']);
    expect(r.items[0]!.reasons).toContain('Квиз');
    expect(slugs(r)).not.toContain(ids['demo-bar-18']);
  });

  it('семья с детьми 4–6, помещение, игры: бар 18+ исключён', async () => {
    const r = await run({
      socialEnergy: 'medium', companion: 'family', mood: 'connection', setting: 'indoor', direction: 'games',
      branchAnswers: { G1: 'social', G2_SOCIAL: 'boardgames', G3: 'any' }, dayChoice: 'weekend', budgetTier: 'mid', budgetBasis: 'per_person',
      partySize: 4, childAgeBands: ['4-6'],
    });
    const ids = await bySlug();
    expect(slugs(r)).toContain(ids['demo-nastolki']);
    expect(slugs(r)).not.toContain(ids['demo-bar-18']);
    expect(slugs(r)).not.toContain(ids['demo-vr-club']); // 12+
    expect(r.items.find((i) => i.id === ids['demo-nastolki'])!.notes).toContain('partial_age'); // с 6 лет, детям 4–6 подходит частично
  });

  it('домашний вечер → только домашние идеи, никогда заведения', async () => {
    const r = await run({
      socialEnergy: 'any', companion: 'friend', mood: 'connection', setting: 'home',
      branchAnswers: { H1: 'games', H2: 'some' }, dayChoice: 'today', budgetTier: 'low', budgetBasis: 'total',
    });
    expect(r.items.length).toBeGreaterThan(0);
    expect(r.items.every((i) => i.type === 'activity')).toBe(true);
    expect(r.items[0]!.reasons.join(' ')).toContain('Домашние игры');
  });

  it('одиночка и квест от 4 человек: исключён; VR для одного — подходит', async () => {
    const r = await run({
      socialEnergy: 'any', companion: 'solo', mood: 'excitement', setting: 'indoor', direction: 'games',
      branchAnswers: { G1: 'surprise', G3: 'any' }, dayChoice: 'weekend', budgetTier: 'any',
    });
    const ids = await bySlug();
    expect(slugs(r)).not.toContain(ids['demo-quiz-bar']);
    expect(slugs(r)).toContain(ids['demo-vr-club']);
  });

  it('отменённое событие не рекомендуется, подходящее по дате — да', async () => {
    const r = await run({
      socialEnergy: 'low', companion: 'friend', mood: 'discovery', setting: 'indoor', direction: 'culture',
      branchAnswers: { C1: 'story', C2: 'watch' }, dayChoice: 'weekend', budgetTier: 'mid', budgetBasis: 'per_person',
    });
    const ids = await bySlug();
    expect(slugs(r)).toContain(ids['demo-koncert']);
    expect(slugs(r)).not.toContain(ids['demo-otmenennoe']);
    expect(r.items.find((i) => i.id === ids['demo-koncert'])!.when).not.toBeNull();
  });

  it('направление без подходящих данных: «Похожие идеи» вместо пустой ошибки', async () => {
    const r = await run({
      socialEnergy: 'high', companion: 'group', mood: 'excitement', setting: 'any', direction: 'wellness',
      branchAnswers: { R1: 'light', R2: 'any' }, dayChoice: 'weekend', budgetTier: 'any', partySize: 5,
    });
    expect(r.empty).toBe(false);
    expect(r.relaxed.length).toBeGreaterThan(0);
  });

  it('пустой каталог (production без demo) не ломает подборку', async () => {
    const r = await run({
      socialEnergy: 'any', companion: 'solo', mood: 'relax', setting: 'indoor', direction: 'culture',
      branchAnswers: { C1: 'visual', C2: 'any' }, dayChoice: 'today', budgetTier: 'any',
    }, false);
    expect(r).toEqual({ items: [], relaxed: [], empty: true });
  });
});
