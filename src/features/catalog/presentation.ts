import type { Illustration } from '@/components/ui/Art';
import { DIRECTION_TAGS, tagLabel } from '@/features/recommend/tag-registry';

/** Какую иллюстрацию из кита и какую плитку (cool = accent-soft, warm = sunset-soft) показывать по тегам. */
export function illustrationFor(tags: string[]): { art: Illustration; warm: boolean } {
  const has = (k: string) => tags.includes(k);
  if (has('walks')) return { art: 'kul-sharif', warm: false };
  if (has('culture')) return { art: 'notes', warm: false };
  if (has('venues') || has('home_cook')) return { art: 'echpochmak', warm: true };
  if (has('wellness')) return { art: 'tulip', warm: false };
  return { art: 'tulip', warm: true };
}

export function directionLabel(tags: string[]): string | null {
  const k = tags.find((t) => (DIRECTION_TAGS as readonly string[]).includes(t));
  return k ? tagLabel(k) : null;
}

export const TYPE_LABEL = { place: 'Место', event: 'Событие', activity: 'Идея на дом' } as const;
export const TYPE_PATH = { place: 'places', event: 'events', activity: 'activities' } as const;

export function formatPrice(min: number | null, max: number | null, unit: 'per_person' | 'total' | 'unknown'): string {
  if (min == null && max == null) return 'Цена уточняется';
  const nf = new Intl.NumberFormat('ru-RU');
  const suffix = unit === 'per_person' ? ' с человека' : unit === 'total' ? ' за всех' : '';
  if ((min ?? max) === 0 && (max ?? min) === 0) return 'Бесплатно';
  if (min != null && max != null && min !== max) return `${nf.format(min)}–${nf.format(max)} ₽${suffix}`;
  if (min != null && max == null) return `от ${nf.format(min)} ₽${suffix}`;
  return `${nf.format((min ?? max)!)} ₽${suffix}`;
}
