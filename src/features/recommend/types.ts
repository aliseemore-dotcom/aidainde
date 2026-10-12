import type { QuizAnswers } from '@/features/quiz/types';
import type { DateRange } from '@/lib/date-kazan';

export type ContentType = 'place' | 'event' | 'activity';
export type Setting = 'indoor' | 'outdoor' | 'both' | 'unknown' | 'home';
export type PriceUnit = 'per_person' | 'total' | 'unknown';

export interface Occurrence { startsAt: Date; endsAt: Date | null; status: 'published' | 'cancelled' | 'sold_out'; ticketsUrl?: string | null }

/** Единый вид места, события или домашней идеи для движка. Не зависит от БД. */
export interface Candidate {
  type: ContentType;
  id: string;
  slug: string;
  title: string;
  description: string;
  status: 'draft' | 'published' | 'cancelled' | 'sold_out' | 'archived';
  isDemo: boolean;
  tags: string[];
  setting: Setting;
  priceMin: number | null;
  priceMax: number | null;
  priceUnit: PriceUnit;
  ageMin: number | null;
  ageMax: number | null;
  minParticipants: number | null;
  maxParticipants: number | null;
  soloFriendly: boolean | null;
  joinOpenGroup: boolean | null;
  requiresBooking: boolean | null;
  durationMinutes: number | null;
  /** только события: сеансы (основной + дополнительные) */
  occurrences: Occurrence[];
  /** события: логическая дата истечения; verifiedAt обязателен для актуальной подборки */
  expiresAt: Date | null;
  verifiedAt: Date | null;
  sourceUrl: string | null;
  address: string | null;
  district: string | null;
  hasOpeningHours: boolean;
  hasImage: boolean;
  publishedAt: Date | null;
  updatedAt: Date;
}

export type FinalAnswers = Required<Pick<QuizAnswers, 'socialEnergy' | 'companion' | 'mood' | 'setting' | 'dayChoice' | 'budgetTier' | 'budgetBasis' | 'partySize'>> &
  Pick<QuizAnswers, 'direction' | 'branchAnswers' | 'targetDate' | 'childAgeBands' | 'transport'>;

export type Tier = 'main' | 'similar' | 'price_unknown';

export type NoteCode =
  | 'check_weather' | 'check_hours' | 'price_unknown' | 'partial_age' | 'capacity_unknown'
  | 'book_ahead' | 'verify_availability' | 'age_unknown';

export const NOTE_TEXT: Record<NoteCode, string> = {
  check_weather: 'Проверьте погоду перед прогулкой',
  check_hours: 'Проверьте часы работы',
  price_unknown: 'Цена уточняется',
  partial_age: 'Подходит не для всех выбранных возрастов',
  capacity_unknown: 'Размер компании уточняйте у организатора',
  book_ahead: 'Лучше записаться заранее',
  verify_availability: 'Наличие мест проверяйте у организатора',
  age_unknown: 'Возрастные ограничения уточняйте у организатора',
};

export interface Recommendation {
  type: ContentType;
  id: string;
  slug: string;
  title: string;
  tier: Tier;
  score: number;
  reasons: string[];
  reasonCodes: string[];
  notes: NoteCode[];
  /** выбранный сеанс события */
  when: { startsAt: string; endsAt: string | null } | null;
  priceMin: number | null;
  priceMax: number | null;
  priceUnit: PriceUnit;
  isDemo: boolean;
  tags: string[];
}

export type RelaxedFilter = { key: 'subtype' | 'direction'; label: string };

export interface RecommendationResult {
  items: Recommendation[];
  relaxed: RelaxedFilter[];
  /** Почему пусто (для понятных кнопок), если items пуст */
  empty: boolean;
}

export interface EngineInput {
  answers: FinalAnswers;
  range: DateRange;
  now: Date;
  candidates: Candidate[];
  allowDemo: boolean;
}
