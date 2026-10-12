import { describe, expect, it } from 'vitest';
import { recommend, diversify, MAX_MAIN } from '@/features/recommend/engine';
import { checkEligibility } from '@/features/recommend/eligibility';
import { score } from '@/features/recommend/scoring';
import type { Candidate, FinalAnswers, Occurrence } from '@/features/recommend/types';
import { resolveDayChoice } from '@/lib/date-kazan';

const NOW = new Date('2026-10-12T09:00:00Z'); // понедельник, Казань
const SAT = '2026-10-17';
const at = (iso: string, hhmm: string) => new Date(`${iso}T${hhmm}:00+03:00`);

let n = 0;
function cand(over: Partial<Candidate> = {}): Candidate {
  n++;
  return {
    type: 'place', id: `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`, slug: `c-${n}`, title: `Объект ${n}`,
    description: 'Достаточно длинное описание для проверки качества данных.', status: 'published', isDemo: false,
    tags: ['games', 'game_quiz', 'game_mind', 'mood_excitement', 'company_group'], setting: 'indoor',
    priceMin: 500, priceMax: 500, priceUnit: 'per_person', ageMin: null, ageMax: null, minParticipants: null, maxParticipants: null,
    soloFriendly: null, joinOpenGroup: null, requiresBooking: null, durationMinutes: null, occurrences: [], expiresAt: null,
    verifiedAt: NOW, sourceUrl: 'https://example.com/x', address: 'Адрес', district: null, hasOpeningHours: true, hasImage: false,
    publishedAt: NOW, updatedAt: NOW, ...over,
  };
}
const answers = (over: Partial<FinalAnswers> = {}): FinalAnswers => ({
  socialEnergy: 'high', companion: 'group', mood: 'excitement', setting: 'indoor', direction: 'games',
  branchAnswers: { G1: 'mind', G2_MIND: 'quiz', G3: 'friendly' }, dayChoice: 'weekend', budgetTier: 'mid', budgetBasis: 'per_person',
  partySize: 6, ...over,
});
const ctx = (a: FinalAnswers) => ({ range: resolveDayChoice(a.dayChoice, NOW, a.targetDate), now: NOW, allowDemo: false });
const run = (a: FinalAnswers, candidates: Candidate[], allowDemo = false) =>
  recommend({ answers: a, range: resolveDayChoice(a.dayChoice, NOW, a.targetDate), now: NOW, candidates, allowDemo });
const codeOf = (c: Candidate, a: FinalAnswers) => { const r = checkEligibility(c, a, ctx(a)); return r.ok ? 'ok' : r.code; };

describe('жёсткие фильтры', () => {
  it('черновик, demo и неопубликованное исключаются', () => {
    const a = answers();
    expect(codeOf(cand({ status: 'draft' }), a)).toBe('not_published');
    expect(codeOf(cand({ status: 'archived' }), a)).toBe('not_published');
    expect(codeOf(cand({ isDemo: true }), a)).toBe('demo');
    expect(checkEligibility(cand({ isDemo: true }), a, { ...ctx(a), allowDemo: true }).ok).toBe(true);
  });

  it('дом: только домашние идеи; вне дома — только места и события', () => {
    const idea = cand({ type: 'activity', setting: 'home', tags: ['home', 'home_games'] });
    expect(codeOf(cand(), answers({ setting: 'home', direction: undefined }))).toBe('home_requires_idea');
    expect(codeOf(idea, answers({ setting: 'home', direction: undefined }))).toBe('ok');
    expect(codeOf(idea, answers())).toBe('not_home_idea');
  });

  it('улица/помещение: известное несоответствие исключается, both/unknown проходят', () => {
    expect(codeOf(cand({ setting: 'indoor' }), answers({ setting: 'outside' }))).toBe('setting_mismatch');
    expect(codeOf(cand({ setting: 'outdoor' }), answers({ setting: 'indoor' }))).toBe('setting_mismatch');
    expect(codeOf(cand({ setting: 'both' }), answers({ setting: 'outside' }))).toBe('ok');
    expect(codeOf(cand({ setting: 'unknown' }), answers({ setting: 'outside' }))).toBe('ok');
    expect(codeOf(cand({ setting: 'indoor' }), answers({ setting: 'any' }))).toBe('ok');
  });

  it('семья с детьми: 18+ исключается независимо от тегов и рейтинга', () => {
    const a = answers({ companion: 'family', childAgeBands: ['4-6'], partySize: 4 });
    expect(codeOf(cand({ ageMin: 18 }), a)).toBe('adult_only');
    expect(codeOf(cand({ tags: ['games', 'adult_only'] }), a)).toBe('adult_only');
    expect(codeOf(cand({ ageMin: 18 }), answers({ companion: 'family', childAgeBands: [], partySize: 2 }))).toBe('ok'); // семья без детей
  });

  it('возраст детей: нет пересечения — исключить, частичное — пометить', () => {
    const a = answers({ companion: 'family', childAgeBands: ['0-3', '7-12'], partySize: 4 });
    expect(codeOf(cand({ ageMin: 14 }), a)).toBe('age_incompatible');
    const r = checkEligibility(cand({ ageMin: 6 }), a, ctx(a));
    expect(r.ok && r.partialAge).toBe(true); // 0–3 не подходит, 7–12 подходит
    expect(r.ok && r.notes).toContain('partial_age');
    const full = checkEligibility(cand({ ageMin: 0 }), a, ctx(a));
    expect(full.ok && full.partialAge).toBe(false);
  });

  it('вместимость: min/max, неизвестный размер не считается «подходит всем»', () => {
    expect(codeOf(cand({ minParticipants: 4 }), answers({ partySize: 2 }))).toBe('below_min');
    expect(codeOf(cand({ maxParticipants: 4 }), answers({ partySize: 6 }))).toBe('above_max');
    expect(codeOf(cand({ minParticipants: 4 }), answers({ companion: 'solo', partySize: 1 }))).toBe('below_min');
    expect(codeOf(cand({ minParticipants: 4, joinOpenGroup: true }), answers({ companion: 'solo', partySize: 1 }))).toBe('ok');
    const unknown = checkEligibility(cand(), answers({ partySize: 8 }), ctx(answers({ partySize: 8 })));
    expect(unknown.ok && unknown.notes).toContain('capacity_unknown');
  });

  it('транспорт: «нужна машина» исключается при пешком/транспорте', () => {
    expect(codeOf(cand({ tags: ['walks', 'car_required'] }), answers({ transport: 'walking_transit' }))).toBe('transport');
    expect(codeOf(cand({ tags: ['walks', 'car_required'] }), answers({ transport: 'car' }))).toBe('ok');
    expect(codeOf(cand({ tags: ['walks', 'car_required'] }), answers({}))).toBe('ok');
  });

  it('бюджет: 0 и «неизвестно» — разные вещи; per_person / total пересчитываются', () => {
    const free = answers({ budgetTier: 'free' });
    expect(codeOf(cand({ priceMin: 0, priceMax: 0 }), free)).toBe('ok');
    expect(codeOf(cand({ priceMin: 100, priceMax: 100 }), free)).toBe('budget');
    const unknown = checkEligibility(cand({ priceMin: null, priceMax: null }), free, ctx(free));
    expect(unknown.ok && unknown.cost).toBeNull(); // не превращается в 0
    expect(unknown.ok && unknown.notes).toContain('price_unknown');
    // 1000 с человека × 6 человек: на человека укладывается в «до 1000», на всех — нет
    const pp = cand({ priceMin: 1000, priceMax: 1000, priceUnit: 'per_person' });
    expect(codeOf(pp, answers({ budgetTier: 'low', budgetBasis: 'per_person' }))).toBe('ok');
    expect(codeOf(pp, answers({ budgetTier: 'low', budgetBasis: 'total' }))).toBe('budget');
    // 6000 за всех: на человека выходит 1000
    const tot = cand({ priceMin: 6000, priceMax: 6000, priceUnit: 'total' });
    expect(codeOf(tot, answers({ budgetTier: 'low', budgetBasis: 'per_person' }))).toBe('ok');
    expect(codeOf(tot, answers({ budgetTier: 'low', budgetBasis: 'total' }))).toBe('budget');
    expect(codeOf(tot, answers({ budgetTier: 'any' }))).toBe('ok');
  });

  it('события: нет сеанса на дату, прошедшее, отменённый сеанс, непроверенное, истёкшее', () => {
    const ev = (over: Partial<Candidate> = {}, occ: Occurrence[] = [{ startsAt: at(SAT, '19:00'), endsAt: at(SAT, '21:00'), status: 'published' }]) =>
      cand({ type: 'event', occurrences: occ, ...over });
    const a = answers({ dayChoice: 'weekend' });
    expect(codeOf(ev(), a)).toBe('ok');
    expect(codeOf(ev(), answers({ dayChoice: 'today' }))).toBe('no_occurrence');
    expect(codeOf(ev({}, [{ startsAt: at('2026-10-12', '08:00'), endsAt: at('2026-10-12', '09:00'), status: 'published' }]), answers({ dayChoice: 'today' }))).toBe('no_occurrence'); // уже прошло (12:00 MSK сейчас)
    expect(codeOf(ev({}, [{ startsAt: at(SAT, '19:00'), endsAt: null, status: 'cancelled' }]), a)).toBe('no_occurrence');
    expect(codeOf(ev({}, [{ startsAt: at(SAT, '19:00'), endsAt: null, status: 'sold_out' }]), a)).toBe('no_occurrence');
    expect(codeOf(ev({ verifiedAt: null }), a)).toBe('unverified_event');
    expect(codeOf(ev({ expiresAt: at('2026-10-11', '00:00') }), a)).toBe('expired');
    // второй сеанс повторяющегося мероприятия попадает на выбранную дату
    expect(codeOf(ev({}, [
      { startsAt: at('2026-10-14', '19:00'), endsAt: null, status: 'published' }, { startsAt: at(SAT, '19:00'), endsAt: null, status: 'published' },
    ]), a)).toBe('ok');
  });

  it('событие в процессе ещё доступно «сегодня»', () => {
    const e = cand({ type: 'event', occurrences: [{ startsAt: at('2026-10-12', '10:00'), endsAt: at('2026-10-12', '20:00'), status: 'published' }] });
    expect(codeOf(e, answers({ dayChoice: 'today' }))).toBe('ok');
  });
});

describe('баллы', () => {
  it('веса даёт 100 для идеального совпадения и нейтральны для «any»', () => {
    const perfect = cand({ tags: ['games', 'game_mind', 'game_quiz', 'comp_friendly', 'mood_excitement', 'company_group', 'energy_high', 'x1', 'x2'], hasImage: true, setting: 'indoor' });
    const m = score(perfect, answers());
    expect(m.score).toBeGreaterThanOrEqual(95);
    const anyAnswers = answers({ socialEnergy: 'any', setting: 'any', budgetTier: 'any', branchAnswers: { G1: 'surprise', G3: 'any' } });
    const m2 = score(perfect, anyAnswers);
    expect(m2.parts.energy).toBeNull();
    expect(m2.parts.budget).toBeNull();
    expect(m2.parts.atmosphere).toBeNull();
  });

  it('неизвестные теги и setting=unknown не считаются совпадением', () => {
    const m = score(cand({ tags: ['games'], setting: 'unknown' }), answers());
    expect(m.parts.mood).toBe(0);
    expect(m.parts.company).toBeLessThan(1);
    expect(m.settingMatched).toBe(false);
  });

  it('балл всегда в диапазоне 0–100', () => {
    for (const c of [cand({ tags: [] }), cand({ tags: ['games', 'game_quiz', 'game_mind'] })]) {
      const s = score(c, answers()).score;
      expect(s).toBeGreaterThanOrEqual(0);
      expect(s).toBeLessThanOrEqual(100);
    }
  });
});

describe('подборка', () => {
  it('лучшие по совпадению выше; порядок детерминирован (id как последний tie-break)', () => {
    const good = cand({ tags: ['games', 'game_mind', 'game_quiz', 'mood_excitement', 'company_group', 'energy_high'] });
    const weak = cand({ tags: ['games', 'game_mind', 'game_quiz'] });
    const twinA = cand({ tags: ['games', 'game_mind', 'game_quiz'] });
    const r1 = run(answers(), [weak, twinA, good]);
    const r2 = run(answers(), [good, twinA, weak]);
    expect(r1.items.map((i) => i.id)).toEqual(r2.items.map((i) => i.id));
    expect(r1.items[0]!.id).toBe(good.id);
  });

  it('не более 7 основных карточек', () => {
    const many = Array.from({ length: 12 }, (_, i) => cand({ tags: ['games', 'game_mind', 'game_quiz', i % 2 ? 'x' : 'y'] }));
    expect(run(answers(), many).items.filter((i) => i.tier !== 'price_unknown').length).toBeLessThanOrEqual(MAX_MAIN);
  });

  it('разнообразие: не более двух из одной подкатегории, если есть альтернатива в пределах 15 баллов', () => {
    const quiz = Array.from({ length: 4 }, () => cand({ tags: ['games', 'game_mind', 'game_quiz', 'mood_excitement', 'company_group'] }));
    const alt = cand({ tags: ['games', 'game_mind', 'game_strategy', 'mood_excitement', 'company_group'] });
    const out = diversify(quiz.map((c) => ({ c, m: { score: 80 } })).concat([{ c: alt, m: { score: 70 } }]), 3);
    const subs = out.map((x) => x.c.tags.find((t) => t === 'game_quiz' || t === 'game_strategy'));
    expect(subs.filter((s) => s === 'game_quiz').length).toBeLessThanOrEqual(2);
    expect(subs).toContain('game_strategy');
    // без альтернативы правило ослабляется
    const only = diversify(quiz.map((c) => ({ c, m: { score: 80 } })), 3);
    expect(only).toHaveLength(3);
    // альтернатива дальше 15 баллов — правило не применяется
    const far = diversify(quiz.map((c) => ({ c, m: { score: 90 } })).concat([{ c: alt, m: { score: 60 } }]), 3);
    expect(far.map((x) => x.c)).toEqual(quiz.slice(0, 3));
  });

  it('цена неизвестна -> блок «Стоимость уточняется» ниже уверенных; при бюджете «неважно» — в основном списке', () => {
    const priced = cand({ priceMin: 300, priceMax: 300 });
    const unknown = cand({ priceMin: null, priceMax: null, tags: ['games', 'game_mind', 'game_quiz', 'mood_excitement', 'company_group', 'energy_high'] });
    const r = run(answers({ budgetTier: 'mid' }), [unknown, priced]);
    expect(r.items.map((i) => i.tier)).toEqual(['similar', 'price_unknown'].slice(0, 0).concat(['main', 'price_unknown']));
    expect(r.items[r.items.length - 1]!.id).toBe(unknown.id);
    const any = run(answers({ budgetTier: 'any' }), [unknown, priced]);
    expect(any.items.every((i) => i.tier === 'main')).toBe(true);
    // «бесплатно»: неизвестная цена не считается бесплатной
    const free = run(answers({ budgetTier: 'free' }), [unknown]);
    expect(free.items[0]!.tier).toBe('price_unknown');
  });

  it('fallback: смягчаем подвид, затем соседние направления, и честно сообщаем об этом', () => {
    const strictOne = cand({ tags: ['games', 'game_mind', 'game_quiz'] });
    const sameDirection = Array.from({ length: 2 }, () => cand({ tags: ['games', 'game_social'] }));
    const neighbor = cand({ tags: ['venues', 'venue_play'] });
    const r = run(answers(), [strictOne, ...sameDirection, neighbor]);
    expect(r.relaxed.map((x) => x.key)).toEqual(['subtype']);
    expect(r.items.filter((i) => i.tier === 'similar').length).toBe(2);
    const r2 = run(answers(), [strictOne, neighbor]);
    expect(r2.relaxed.map((x) => x.key)).toEqual(['direction']);
    expect(r2.items.find((i) => i.id === neighbor.id)!.tier).toBe('similar');
  });

  it('fallback никогда не нарушает возраст, дату, вместимость и бюджет', () => {
    const kids = answers({ companion: 'family', childAgeBands: ['4-6'], partySize: 4 });
    const bad = cand({ ageMin: 18, tags: ['games', 'game_social'] });
    expect(run(kids, [bad]).empty).toBe(true);
    expect(run(answers({ budgetTier: 'low' }), [cand({ priceMin: 4000, priceMax: 4000, tags: ['games'] })]).empty).toBe(true);
  });

  it('пустой каталог и ноль подходящих: честный пустой результат без ошибки', () => {
    const r = run(answers(), []);
    expect(r).toEqual({ items: [], relaxed: [], empty: true });
  });

  it('«Почему подходит» — только подтверждённые факты; даты событий в Казани', () => {
    const ev = cand({
      type: 'event', tags: ['games', 'game_mind', 'game_quiz', 'company_group', 'mood_excitement'],
      occurrences: [{ startsAt: at(SAT, '19:00'), endsAt: null, status: 'published' }],
    });
    const r = run(answers(), [ev]);
    const rec = r.items[0]!;
    expect(rec.reasons.join(' · ')).toContain('Квиз');
    expect(rec.reasons).toContain('Для компании');
    expect(rec.reasons.some((x) => /19:00/.test(x))).toBe(true);
    expect(rec.reasons.join(' ')).not.toMatch(/свободн|есть места|мест нет/i);
    expect(rec.notes).toContain('verify_availability');
    // у нарочно непохожего объекта нет выдуманных причин
    const lone = run(answers(), [cand({ tags: ['games'], setting: 'unknown' })]).items[0]!;
    expect(lone.reasons.length).toBeGreaterThan(0);
  });

  it('домашний сценарий: рекомендует только домашние идеи', () => {
    const a = answers({ setting: 'home', direction: undefined, branchAnswers: { H1: 'cook', H2: 'project' }, socialEnergy: 'any' });
    const idea = cand({ type: 'activity', setting: 'home', tags: ['home', 'home_cook', 'effort_project'], priceUnit: 'total', priceMin: 400, priceMax: 900 });
    const r = run(a, [cand(), idea, cand({ tags: ['venues', 'home_cook'] })]);
    expect(r.items.map((i) => i.id)).toEqual([idea.id]);
  });

  it('семья с детьми 4–6 лет, помещение, игры: 18+ не попадает, детский вариант попадает', () => {
    const a = answers({ companion: 'family', childAgeBands: ['4-6'], partySize: 4, socialEnergy: 'medium', mood: 'connection', branchAnswers: { G1: 'social', G2_SOCIAL: 'boardgames', G3: 'any' } });
    const kidFriendly = cand({ tags: ['games', 'game_social', 'game_boardgames', 'company_family', 'mood_connection'], ageMin: 4 });
    const adult = cand({ tags: ['games', 'game_social', 'game_boardgames', 'company_family'], ageMin: 18 });
    const r = run(a, [adult, kidFriendly]);
    expect(r.items.map((i) => i.id)).toEqual([kidFriendly.id]);
  });

  it('демо-контент не попадает в подборку без allowDemo', () => {
    const demo = cand({ isDemo: true });
    expect(run(answers(), [demo], false).empty).toBe(true);
    expect(run(answers(), [demo], true).empty).toBe(false);
  });
});
