/**
 * Тип постоянного места: «что это за заведение или площадка».
 * Это другая ось, чем теги: теги — сигналы для подбора (настроение, компания, нагрузка…), тип — как место
 * называется для человека и в каталоге. Подбор тип не использует, поэтому параллельным словарём тегов он не является.
 */
export const PLACE_KINDS = [
  { key: 'restaurant', label: 'Ресторан' },
  { key: 'cafe', label: 'Кафе' },
  { key: 'coffee_shop', label: 'Кофейня' },
  { key: 'bar', label: 'Бар' },
  { key: 'antikafe', label: 'Антикафе' },
  { key: 'club', label: 'Клуб' },
  { key: 'entertainment', label: 'Развлекательный центр' },
  { key: 'museum', label: 'Музей' },
  { key: 'gallery', label: 'Галерея или выставочное пространство' },
  { key: 'theatre', label: 'Театр' },
  { key: 'concert_hall', label: 'Концертный зал' },
  { key: 'cinema', label: 'Кинотеатр' },
  { key: 'park', label: 'Парк или сквер' },
  { key: 'embankment', label: 'Набережная' },
  { key: 'nature', label: 'Природная территория' },
  { key: 'spa', label: 'Спа или бани' },
  { key: 'sports', label: 'Спортивный центр' },
  { key: 'studio', label: 'Студия или мастерская' },
  { key: 'other', label: 'Другое' },
] as const;

export type PlaceKind = (typeof PLACE_KINDS)[number]['key'];
export const PLACE_KIND_KEYS = PLACE_KINDS.map((k) => k.key) as [PlaceKind, ...PlaceKind[]];
const LABEL = new Map<string, string>(PLACE_KINDS.map((k) => [k.key, k.label]));
export const placeKindLabel = (key: string | null | undefined): string | null => (key ? LABEL.get(key) ?? null : null);
