import { branchRequirements, SOCIAL_ENERGY_TAG, type Req } from './tag-map';
import { BUDGET_LIMIT, lowerCost } from './eligibility';
import { mostSpecific } from './tag-registry';
import type { Candidate, FinalAnswers } from './types';

/** Веса критериев (§9 шаг 3), сумма = 100. */
export const WEIGHTS = { direction: 35, mood: 20, company: 15, energy: 10, atmosphere: 10, budget: 5, quality: 5 } as const;
export type Criterion = keyof typeof WEIGHTS;

export interface Match {
  score: number;
  /** доля 0..1 по каждому применимому критерию; null = критерий неприменим (нейтрален) */
  parts: Record<Criterion, number | null>;
  directionMatch: boolean;
  subtypeAllMatched: boolean;
  matchedSubtypeTags: string[];
  /** самый конкретный из совпавших тегов подвида — для объяснения */
  mostSpecificMatch: string | undefined;
  companyMatched: boolean;
  settingMatched: boolean;
  moodMatched: boolean;
}

const has = (c: Candidate, tags: string[]) => tags.some((t) => c.tags.includes(t));
const avg = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null);
const reqMatched = (c: Candidate, r: Req) => has(c, r.tags);

export function directionMatches(c: Candidate, a: FinalAnswers): boolean {
  if (a.setting === 'home') return c.type === 'activity';
  return !!a.direction && c.tags.includes(a.direction);
}

/** Качество и полнота данных (0..1) — по применимым проверкам. */
export function dataQuality(c: Candidate): number {
  const checks: boolean[] = [
    c.description.trim().length >= 40,
    !!c.sourceUrl || c.type === 'activity',
    c.priceMin != null || c.priceMax != null,
    c.tags.length >= 4,
    c.hasImage,
  ];
  if (c.type !== 'activity') checks.push(!!c.address, !!c.verifiedAt);
  return checks.filter(Boolean).length / checks.length;
}

export function score(c: Candidate, a: FinalAnswers): Match {
  const reqs = branchRequirements(a.branchAnswers);
  const subtype = reqs.filter((r) => r.kind === 'subtype');
  const intensity = reqs.filter((r) => r.kind === 'intensity');
  const atmosphereReqs = reqs.filter((r) => r.kind === 'atmosphere');
  const dir = directionMatches(c, a);
  const subMatched = subtype.filter((r) => reqMatched(c, r));

  // направление/подвид: 40% за само направление, 60% за подвиды; без подвидов — всё за направление
  const direction = subtype.length ? 0.4 * (dir ? 1 : 0) + 0.6 * (subMatched.length / subtype.length) : dir ? 1 : 0;

  const moodMatched = c.tags.includes(`mood_${a.mood}`);
  const mood = moodMatched ? 1 : 0;

  // состав компании: тег компании, либо известная вместимость, подходящая под размер группы
  const companyTag = c.tags.includes(`company_${a.companion}`) || (a.companion === 'solo' && c.soloFriendly === true);
  const capacityKnown = c.minParticipants != null || c.maxParticipants != null;
  const capacityFits = capacityKnown && (c.minParticipants == null || a.partySize >= c.minParticipants || !!c.joinOpenGroup) && (c.maxParticipants == null || a.partySize <= c.maxParticipants);
  const company = companyTag ? 1 : capacityFits ? 0.6 : 0;

  const energy = intensity.length ? intensity.filter((r) => reqMatched(c, r)).length / intensity.length : null;

  const atmos: number[] = [];
  let settingMatched = false;
  if (a.setting !== 'any') {
    const fit = a.setting === 'home' ? (c.type === 'activity' ? 1 : 0)
      : c.setting === a.setting ? 1 : c.setting === 'both' ? 0.7 : 0; // unknown не считается совпадением
    settingMatched = fit >= 0.7;
    atmos.push(fit);
  }
  const se = SOCIAL_ENERGY_TAG[a.socialEnergy];
  if (se) atmos.push(c.tags.includes(se) ? 1 : 0);
  for (const r of atmosphereReqs) atmos.push(reqMatched(c, r) ? 1 : 0);
  const atmosphere = avg(atmos);

  const limit = BUDGET_LIMIT[a.budgetTier] ?? null;
  const cost = lowerCost(c, a.budgetBasis, a.partySize);
  let budget: number | null = null;
  if (limit != null && cost != null) budget = limit === 0 ? (cost === 0 ? 1 : 0) : cost / limit <= 0.5 ? 1 : cost / limit <= 1 ? 0.6 : 0;

  const parts: Record<Criterion, number | null> = {
    direction, mood, company, energy, atmosphere, budget, quality: dataQuality(c),
  };
  let earned = 0; let possible = 0;
  for (const k of Object.keys(WEIGHTS) as Criterion[]) {
    const f = parts[k];
    if (f == null) continue; // неприменимый критерий нейтрален
    earned += WEIGHTS[k] * f; possible += WEIGHTS[k];
  }
  return {
    score: possible ? Math.round((100 * earned) / possible) : 0,
    parts, directionMatch: dir,
    subtypeAllMatched: subtype.length === subMatched.length,
    matchedSubtypeTags: subMatched.flatMap((r) => r.tags.filter((t) => c.tags.includes(t)).slice(0, 1)),
    mostSpecificMatch: mostSpecific(subMatched.flatMap((r) => r.tags.filter((t) => c.tags.includes(t)))),
    companyMatched: companyTag, settingMatched, moodMatched,
  };
}
