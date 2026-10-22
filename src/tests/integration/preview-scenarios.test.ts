import { writeFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { createMemoryDb, type Db } from '@/db/client';
import { seedTags } from '@/features/catalog/mutations';
import { seedPreview } from '@/db/seed-preview';
import { listCatalog, getContentBySlug, loadCandidates } from '@/features/catalog/queries';
import { catalogQuery } from '@/features/catalog/validators';
import { completeQuiz, type Ctx } from '@/features/results/service';
import { allowDraftPreview, contentVisibility } from '@/lib/env';
import { PLACE_KINDS } from '@/features/catalog/place-kinds';
import type { Recommendation } from '@/features/recommend/types';

const NOW = new Date('2026-10-22T09:00:00Z'); // чт, Казань
const ctx = (drafts: boolean): Ctx => ({ now: NOW, allowDemo: false, allowDrafts: drafts, secret: 'scenario-secret-scenario' });
let db: Db;
const report: Record<string, unknown>[] = [];

beforeAll(async () => {
  db = await createMemoryDb(); await seedTags(db);
  const r = await seedPreview(db);
  expect(r).toMatchObject({ places: 69, events: 64, skipped: [] });
});

const base = { socialEnergy: 'medium', companion: 'friend', mood: 'connection', setting: 'indoor', dayChoice: 'weekend', budgetTier: 'any' } as const;
async function go(name: string, answers: Record<string, unknown>, drafts = true) {
  const out = await completeQuiz(db, { schemaVersion: 1, quizType: 'main', answers }, ctx(drafts));
  const items = out.results as Recommendation[];
  report.push({
    сценарий: name, найдено: items.length, смягчено: out.relaxedFilters.map((r) => r.key).join(',') || '—',
    уровни: [...new Set(items.map((i) => i.tier))].join(','), типы: [...new Set(items.map((i) => i.type))].join(','),
    первые: items.slice(0, 3).map((i) => i.title).join(' | '),
  });
  return { out, items };
}

describe('сценарии теста на подготовленных данных (черновики, режим предпросмотра)', () => {
  it('1. друзья, помещение, заведения, «едим и болтаем»: только подходящие заведения, бары не в основном списке', async () => {
    const { items } = await go('друзья · заведения · еда и разговоры', { ...base, direction: 'venues', branchAnswers: { V1: 'food_talk', V2: 'sit' } });
    const main = items.filter((i) => i.tier === 'main');
    expect(main.length).toBeGreaterThanOrEqual(3);
    expect(main.length).toBeLessThanOrEqual(7);
    expect(main.every((i) => i.type === 'place' && i.kind !== 'bar' && i.tags.includes('venue_food_talk'))).toBe(true);
    expect(items.every((i) => i.notes.includes('draft_preview'))).toBe(true);
    expect(items.every((i) => i.title && i.address && i.description)).toBe(true);
  });

  it('2. «музыка, движ»: тегов нет — честно смягчаем и сообщаем, но не показываем пусто', async () => {
    const { out, items } = await go('компания · заведения · музыка', { ...base, companion: 'group', direction: 'venues', branchAnswers: { V1: 'music', V2: 'active' }, partySize: 6 });
    expect(items.length).toBeGreaterThan(0);
    expect(out.relaxedFilters.map((r) => r.key)).toContain('subtype');
    expect(items.every((i) => i.tier !== 'main')).toBe(true);
  });

  it('3. семья с детьми 4–6: бары и клубы не показываются совсем', async () => {
    const { items } = await go('семья с детьми · заведения', { ...base, companion: 'family', direction: 'venues', branchAnswers: { V1: 'food_talk', V2: 'sit' }, partySize: 4, childAgeBands: ['4-6'] });
    expect(items.length).toBeGreaterThan(0);
    expect(items.some((i) => i.kind === 'bar' || i.kind === 'club')).toBe(false);
    const adults = await go('друзья · заведения · тихо', { ...base, direction: 'venues', branchAnswers: { V1: 'quiet', V2: 'sit' } });
    expect(adults.items.some((i) => i.kind === 'bar')).toBe(true); // для взрослых бары доступны
  });

  it('4. на улице, прогулка: прогулок в каталоге нет — выдача только «похожие» с пояснением, без обмана', async () => {
    const { out, items } = await go('один · на улице · прогулки', { socialEnergy: 'low', companion: 'solo', mood: 'relax', setting: 'outside', direction: 'walks', branchAnswers: { W1: 'scenic', W2: 'near' }, dayChoice: 'weekend', budgetTier: 'any' });
    expect(items.filter((i) => i.tier === 'main')).toEqual([]);
    if (items.length) expect(out.relaxedFilters.map((r) => r.key)).toContain('direction');
    // заведения для «на улице» скрыты правилом «где», а не показаны вместо прогулки
    expect(items.some((i) => i.type === 'place')).toBe(false);
  });

  it('5. культура, смотреть, на выходные: события с датой и временем, только в выбранные дни', async () => {
    const { items } = await go('пара · культура · выходные', { socialEnergy: 'low', companion: 'partner', mood: 'discovery', setting: 'indoor', direction: 'culture', branchAnswers: { C1: 'story', C2: 'watch' }, dayChoice: 'weekend', budgetTier: 'any' });
    const main = items.filter((i) => i.tier === 'main');
    expect(main.length).toBeGreaterThan(0);
    expect(main.every((i) => i.type === 'event' && i.when)).toBe(true);
    for (const i of main) {
      const d = new Date(i.when!.startsAt).toISOString().slice(0, 10);
      expect(['2026-10-24', '2026-10-25']).toContain(d); // только выходные по Казани
    }
    expect(main.every((i) => /\d{1,2}\s\S+.*\d{2}:\d{2}/.test(i.reasons.join(' ')))).toBe(true); // дата и время в «почему подходит»
  });

  it('6. выбранная дата без событий (сегодня): честная пустая выдача для культуры', async () => {
    const { out } = await go('культура · сегодня (событий нет)', { socialEnergy: 'low', companion: 'solo', mood: 'discovery', setting: 'indoor', direction: 'culture', branchAnswers: { C1: 'story', C2: 'watch' }, dayChoice: 'today', budgetTier: 'any' });
    expect(out.results.every((i: Recommendation) => i.type !== 'event')).toBe(true); // 22 октября событий в файле нет
  });

  it('7. игры, компания 6: данных нет — не подменяем играми рестораны без пометки', async () => {
    const { out, items } = await go('компания · игры', { ...base, companion: 'group', mood: 'excitement', direction: 'games', branchAnswers: { G1: 'mind', G2_MIND: 'quiz', G3: 'friendly' }, partySize: 6 });
    expect(items.filter((i) => i.tier === 'main')).toEqual([]);
    if (items.length) expect(out.relaxedFilters.length).toBeGreaterThan(0);
  });

  it('8. дома: идей на дом нет — пустой результат, а не заведения', async () => {
    const { out, items } = await go('дома', { socialEnergy: 'any', companion: 'solo', mood: 'relax', setting: 'home', branchAnswers: { H1: 'cozy', H2: 'minimal' }, dayChoice: 'today', budgetTier: 'any' });
    expect(items).toEqual([]);
    expect(out.empty).toBe(true);
  });

  it('9. бюджет «бесплатно»: цены неизвестны — всё в блоке «Стоимость уточняется», а не выдано за бесплатное', async () => {
    const { items } = await go('бесплатно · заведения', { ...base, direction: 'venues', branchAnswers: { V1: 'food_talk', V2: 'sit' }, budgetTier: 'free' });
    expect(items.length).toBeGreaterThan(0);
    expect(items.every((i) => i.tier === 'price_unknown')).toBe(true);
  });

  it('10. без режима предпросмотра те же ответы не показывают ничего: черновики скрыты', async () => {
    const { out } = await go('публичный режим · заведения', { ...base, direction: 'venues', branchAnswers: { V1: 'food_talk', V2: 'sit' } }, false);
    expect(out.results).toEqual([]);
    expect(out.empty).toBe(true);
  });
});

describe('видимость черновиков', () => {
  it('каталог и карточки: по умолчанию черновики скрыты, в предпросмотре видны', async () => {
    const q = (type: 'place' | 'event') => catalogQuery.parse({ type });
    expect((await listCatalog(db, q('place'), { allowDemo: false, now: NOW })).total).toBe(0);
    expect((await listCatalog(db, q('event'), { allowDemo: false, now: NOW })).total).toBe(0);
    const places = await listCatalog(db, q('place'), { allowDemo: false, allowDrafts: true, now: NOW });
    expect(places.total).toBe(69);
    expect((await listCatalog(db, q('event'), { allowDemo: false, allowDrafts: true, now: NOW })).total).toBe(64);
    expect(places.items.every((i) => i.status === 'draft' && i.address && i.description)).toBe(true);
    expect(await getContentBySlug(db, 'place', 'hemingway', { allowDemo: false })).toBeNull();
    expect(await getContentBySlug(db, 'place', 'hemingway', { allowDemo: false, includeDraft: true })).not.toBeNull();
    expect(await loadCandidates(db, { allowDemo: false })).toEqual([]);
    expect((await loadCandidates(db, { allowDemo: false, allowDrafts: true })).length).toBe(133);
  });

  it('фильтр по типу места работает на данных; типы из файла — рестораны, кафе, кофейни, бары', async () => {
    const count = async (kind: string) => (await listCatalog(db, catalogQuery.parse({ type: 'place', kind, pageSize: 50 }), { allowDemo: false, allowDrafts: true, now: NOW })).total;
    expect(await count('restaurant')).toBe(38);
    expect(await count('cafe')).toBe(12);
    expect(await count('coffee_shop')).toBe(9);
    expect(await count('bar')).toBe(10);
    expect(PLACE_KINDS.some((k) => k.key === 'bar')).toBe(true);
  });

  it('режим предпросмотра нельзя включить на боевом деплое, даже флагом', () => {
    const env = (o: Record<string, string>) => ({ PREVIEW_DRAFTS: 'true', ...o }) as never;
    expect(allowDraftPreview(env({}))).toBe(true);
    expect(allowDraftPreview(env({ VERCEL_ENV: 'production' }))).toBe(false);
    expect(allowDraftPreview(env({ APP_ENV: 'production' }))).toBe(false);
    expect(allowDraftPreview({} as never)).toBe(false);
    expect(allowDraftPreview({ PREVIEW_DRAFTS: 'yes' } as never)).toBe(false); // только явное true
    expect(contentVisibility(env({ VERCEL_ENV: 'production', ALLOW_DEMO_CONTENT: 'true' }))).toEqual({ allowDemo: false, allowDrafts: false });
  });

  it('отчёт по сценариям (для чтения человеком)', () => {
    writeFileSync('/tmp/claude-0/-home-user-aidainde/14f589fb-f2e5-59d9-9b1c-4d7011cdcf85/scratchpad/scenarios.json', JSON.stringify(report, null, 2));
    expect(report.length).toBeGreaterThanOrEqual(9);
  });
});
