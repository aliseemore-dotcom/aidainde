import { NOTE_TEXT, type Candidate, type FinalAnswers, type NoteCode, type Occurrence } from './types';
import { kazanDayBounds, type DateRange } from '@/lib/date-kazan';

export type ExcludeCode =
  | 'demo' | 'not_published' | 'unverified_event' | 'expired' | 'no_occurrence' | 'setting_mismatch'
  | 'not_home_idea' | 'home_requires_idea' | 'adult_only' | 'age_incompatible' | 'below_min'
  | 'above_max' | 'transport' | 'budget';

export interface Eligible {
  ok: true;
  occurrence: Occurrence | null;
  notes: NoteCode[];
  partialAge: boolean;
  /** нижняя оценка стоимости в выбранном бюджетном базисе; null = цена неизвестна */
  cost: number | null;
}
export type Eligibility = Eligible | { ok: false; code: ExcludeCode };

export const BUDGET_LIMIT: Record<string, number | null> = { free: 0, low: 1000, mid: 3000, high: 5000, any: null };
const BANDS: Record<string, [number, number]> = { '0-3': [0, 3], '4-6': [4, 6], '7-12': [7, 12], '13-17': [13, 17] };

/** Нижняя граница стоимости в базисе пользователя; неизвестная цена НЕ превращается в 0 (§8.8). */
export function lowerCost(c: Candidate, basis: 'per_person' | 'total', party: number): number | null {
  const v = c.priceMin ?? c.priceMax;
  if (v == null) return null;
  const p = Math.max(1, party);
  if (basis === 'per_person') return c.priceUnit === 'total' ? v / p : c.priceUnit === 'per_person' ? v : Math.min(v, v / p);
  return c.priceUnit === 'per_person' ? v * p : v; // total
}

const isAdultOnly = (c: Candidate) => (c.ageMin ?? 0) >= 18 || c.tags.includes('adult_only');
const hasKids = (a: FinalAnswers) => a.companion === 'family' && (a.childAgeBands?.length ?? 0) > 0;

function pickOccurrence(c: Candidate, range: DateRange, now: Date): Occurrence | null {
  const { start, end } = kazanDayBounds(range);
  const ok = c.occurrences
    .filter((o) => o.status === 'published' && o.startsAt >= start && o.startsAt < end && (o.endsAt ?? o.startsAt) >= now)
    .sort((x, y) => x.startsAt.getTime() - y.startsAt.getTime());
  return ok[0] ?? null;
}

/**
 * Жёсткая фильтрация (§9 шаг 2). Мягкие критерии здесь не участвуют; возраст, дата, вместимость и
 * точный бюджет никогда не ослабляются автоматически.
 */
export function checkEligibility(c: Candidate, a: FinalAnswers, ctx: { range: DateRange; now: Date; allowDemo: boolean }): Eligibility {
  if (c.isDemo && !ctx.allowDemo) return { ok: false, code: 'demo' };
  if (c.status !== 'published') return { ok: false, code: 'not_published' };

  // место проведения: дома — только домашние идеи; вне дома — только места и события
  if (a.setting === 'home' && c.type !== 'activity') return { ok: false, code: 'home_requires_idea' };
  if (a.setting !== 'home' && c.type === 'activity') return { ok: false, code: 'not_home_idea' };
  if (a.setting === 'outside' && c.setting === 'indoor') return { ok: false, code: 'setting_mismatch' };
  if (a.setting === 'indoor' && c.setting === 'outdoor') return { ok: false, code: 'setting_mismatch' };

  let occurrence: Occurrence | null = null;
  if (c.type === 'event') {
    if (!c.verifiedAt) return { ok: false, code: 'unverified_event' };
    if (c.expiresAt && c.expiresAt < ctx.now) return { ok: false, code: 'expired' };
    occurrence = pickOccurrence(c, ctx.range, ctx.now);
    if (!occurrence) return { ok: false, code: 'no_occurrence' };
  }

  // возраст
  let partialAge = false;
  const kids = hasKids(a);
  if (kids) {
    if (isAdultOnly(c)) return { ok: false, code: 'adult_only' };
    if (c.ageMin != null || c.ageMax != null) {
      const bands = (a.childAgeBands ?? []).map((b) => BANDS[b]!);
      const overlap = (b: [number, number]) => (c.ageMin == null || c.ageMin <= b[1]) && (c.ageMax == null || c.ageMax >= b[0]);
      const full = (b: [number, number]) => (c.ageMin == null || c.ageMin <= b[0]) && (c.ageMax == null || c.ageMax >= b[1]);
      if (!bands.some(overlap)) return { ok: false, code: 'age_incompatible' };
      partialAge = !bands.every(full);
    }
  }

  // вместимость: неизвестный размер группы никогда не считается «подходит всем»
  if (c.minParticipants != null && a.partySize < c.minParticipants && !c.joinOpenGroup) return { ok: false, code: 'below_min' };
  if (c.maxParticipants != null && a.partySize > c.maxParticipants) return { ok: false, code: 'above_max' };

  // логистика
  if (a.transport === 'walking_transit' && c.tags.includes('car_required')) return { ok: false, code: 'transport' };

  // бюджет: исключаем только при известной цене, превышающей лимит
  const limit = BUDGET_LIMIT[a.budgetTier] ?? null;
  const cost = lowerCost(c, a.budgetBasis, a.partySize);
  if (limit != null && cost != null && cost > limit) return { ok: false, code: 'budget' };

  const notes: NoteCode[] = [];
  if (c.setting === 'outdoor' || c.setting === 'both') notes.push('check_weather');
  if (c.type === 'place' && !c.hasOpeningHours) notes.push('check_hours');
  if (cost == null) notes.push('price_unknown');
  if (partialAge) notes.push('partial_age');
  if (kids && c.ageMin == null && c.ageMax == null) notes.push('age_unknown');
  if (c.type !== 'activity' && c.minParticipants == null && c.maxParticipants == null && a.partySize >= 3) notes.push('capacity_unknown');
  if (c.requiresBooking) notes.push('book_ahead');
  if (c.type === 'event') notes.push('verify_availability');
  return { ok: true, occurrence, notes, partialAge, cost };
}

export const noteText = (n: NoteCode) => NOTE_TEXT[n];
