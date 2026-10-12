import { checkEligibility } from './eligibility';
import { explain } from './reasons';
import { score, type Match } from './scoring';
import { NEIGHBOR_DIRECTIONS } from './tag-map';
import { TAG_BY_KEY, DIRECTION_TAGS, mostSpecific } from './tag-registry';
import type { Candidate, EngineInput, FinalAnswers, Recommendation, RecommendationResult, RelaxedFilter, Tier } from './types';
import type { Eligible } from './eligibility';

export const MAX_MAIN = 7;
export const MIN_MAIN = 3;
export const MAX_PRICE_UNKNOWN = 3;
export const DIVERSITY_WINDOW = 15;

interface Scored { c: Candidate; el: Eligible; m: Match }

/** Узкая подкатегория для разнообразия: первый «подвидовой» тег, иначе направление, иначе тип. */
function subcategory(c: Candidate): string {
  const subtypes = c.tags.filter((t) => {
    const g = TAG_BY_KEY.get(t)?.group;
    return (g === 'category' || g === 'gameStyle') && !(DIRECTION_TAGS as readonly string[]).includes(t) && t !== 'in_city' && t !== 'outskirts';
  });
  return mostSpecific(subtypes) ?? c.tags.find((t) => (DIRECTION_TAGS as readonly string[]).includes(t)) ?? c.type;
}

const byRank = (x: Scored, y: Scored) =>
  y.m.score - x.m.score || y.c.updatedAt.getTime() - x.c.updatedAt.getTime() || (x.c.id < y.c.id ? -1 : x.c.id > y.c.id ? 1 : 0);

/**
 * Не более двух карточек одной узкой подкатегории, если есть альтернатива с баллом в пределах 15 (§9).
 * Жадно берёт лучшую, не нарушающую правило; правило ослабляется, когда альтернативы нет.
 */
export function diversify<T extends { c: Candidate; m: { score: number } }>(sorted: T[], cap: number): T[] {
  const out: T[] = [];
  const counts = new Map<string, number>();
  const rest = [...sorted];
  while (out.length < cap && rest.length) {
    const pickIdx = rest.findIndex((x) => {
      const sub = subcategory(x.c);
      if ((counts.get(sub) ?? 0) < 2) return true;
      const alt = rest.some((y) => y !== x && subcategory(y.c) !== sub && (counts.get(subcategory(y.c)) ?? 0) < 2 && y.m.score >= x.m.score - DIVERSITY_WINDOW);
      return !alt;
    });
    const [x] = rest.splice(pickIdx === -1 ? 0 : pickIdx, 1);
    out.push(x!);
    counts.set(subcategory(x!.c), (counts.get(subcategory(x!.c)) ?? 0) + 1);
  }
  return out;
}

function toRec(s: Scored, a: FinalAnswers, tier: Tier): Recommendation {
  const { reasons, codes } = explain(s.c, a, s.m, s.el.occurrence, s.el.cost);
  return {
    type: s.c.type, id: s.c.id, slug: s.c.slug, title: s.c.title, tier, score: s.m.score,
    reasons: reasons.length ? reasons : ['Похожая идея рядом с твоим выбором'],
    reasonCodes: codes, notes: s.el.notes,
    when: s.el.occurrence ? { startsAt: s.el.occurrence.startsAt.toISOString(), endsAt: s.el.occurrence.endsAt?.toISOString() ?? null } : null,
    priceMin: s.c.priceMin, priceMax: s.c.priceMax, priceUnit: s.c.priceUnit, isDemo: s.c.isDemo, tags: s.c.tags,
  };
}

/**
 * Детерминированная подборка без AI (§9). Чистая функция: время и каталог приходят аргументами.
 * Порядок: жёсткие фильтры -> баллы -> стадии (строго / без подвида / соседние направления)
 * -> разнообразие -> блок «Стоимость уточняется».
 */
export function recommend(input: EngineInput): RecommendationResult {
  const { answers: a, range, now, allowDemo } = input;
  const eligible: Scored[] = [];
  for (const c of input.candidates) {
    const el = checkEligibility(c, a, { range, now, allowDemo });
    if (el.ok) eligible.push({ c, el, m: score(c, a) });
  }

  const unknownPriceGoesBelow = a.budgetTier !== 'any';
  const isUnknown = (s: Scored) => s.el.cost == null;
  const confident = (xs: Scored[]) => (unknownPriceGoesBelow ? xs.filter((s) => !isUnknown(s)) : xs);

  const direct = eligible.filter((s) => s.m.directionMatch).sort(byRank);
  const strict = direct.filter((s) => s.m.subtypeAllMatched);
  const loose = direct.filter((s) => !s.m.subtypeAllMatched);

  const neighborTags = NEIGHBOR_DIRECTIONS[a.setting === 'home' ? 'home' : a.direction ?? ''] ?? [];
  const neighbors = eligible
    .filter((s) => !s.m.directionMatch && neighborTags.some((t) => s.c.tags.includes(t)))
    .sort(byRank);

  const relaxed: RelaxedFilter[] = [];
  let pool: { s: Scored; tier: Tier }[] = confident(strict).map((s) => ({ s, tier: 'main' as Tier }));
  if (pool.length < MIN_MAIN && loose.length) {
    relaxed.push({ key: 'subtype', label: 'Уточнения по формату смягчены: показываем и другие варианты этого направления' });
    pool = [...pool, ...confident(loose).map((s) => ({ s, tier: 'similar' as Tier }))];
  }
  if (pool.length < MIN_MAIN && neighbors.length) {
    relaxed.push({ key: 'direction', label: 'Похожие идеи из соседних направлений' });
    pool = [...pool, ...confident(neighbors).map((s) => ({ s, tier: 'similar' as Tier }))];
  }

  const tierOf = new Map(pool.map((p) => [p.s.c.id, p.tier]));
  // главный блок: сначала строгие совпадения, затем смягчённые; внутри — по рангу и разнообразию
  const mainPool = pool.filter((p) => p.tier === 'main').map((p) => p.s);
  const similarPool = pool.filter((p) => p.tier === 'similar').map((p) => p.s).sort(byRank);
  const main = diversify(mainPool, MAX_MAIN);
  const similar = diversify(similarPool, Math.max(0, MAX_MAIN - main.length));

  let items: Recommendation[] = [
    ...main.map((s) => toRec(s, a, 'main')),
    ...similar.map((s) => toRec(s, a, tierOf.get(s.c.id) ?? 'similar')),
  ];

  // «Стоимость уточняется» — ниже уверенных вариантов; только из подходящих по теме
  if (unknownPriceGoesBelow) {
    const unknown = [...strict, ...loose].filter(isUnknown).sort(byRank).slice(0, MAX_PRICE_UNKNOWN);
    items = [...items, ...unknown.map((s) => toRec(s, a, 'price_unknown'))];
  }
  return { items, relaxed: items.length ? relaxed : [], empty: items.length === 0 };
}
