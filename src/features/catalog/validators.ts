import { z } from 'zod';
import { DIRECTION_TAGS, TAG_KEYS } from '@/features/recommend/tag-registry';

const url = z.string().url().refine((u) => /^https?:\/\//i.test(u), 'Только http(s)');
const optUrl = url.nullish();
const int = z.number().int().nonnegative();
const optInt = int.nullish();
const slug = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'латиница, цифры и дефисы').max(80);
const tagKeys = z.array(z.string()).refine((ks) => ks.every((k) => TAG_KEYS.has(k)), 'Неизвестный тег');

const base = {
  slug,
  title: z.string().trim().min(2).max(160),
  description: z.string().trim().min(10).max(5000),
  status: z.enum(['draft', 'published', 'cancelled', 'sold_out', 'archived']).default('draft'),
  isDemo: z.boolean().default(false),
  tags: tagKeys.default([]),
  ageMin: optInt, ageMax: optInt,
};

const mediaItem = z.object({
  url, alt: z.string().trim().min(3).max(200), order: int.default(0),
  rightsStatus: z.enum(['owned', 'licensed', 'permission', 'unknown']).default('unknown'),
});
const media = z.array(mediaItem).default([]);

export const placeInput = z.object({
  ...base,
  address: z.string().trim().min(3),
  lat: z.number().min(-90).max(90).nullish(), lng: z.number().min(-180).max(180).nullish(),
  district: z.string().nullish(),
  contactsJson: z.object({ phone: z.string().optional(), email: z.string().optional(), social: z.string().optional() }).nullish(),
  websiteUrl: optUrl, bookingUrl: optUrl,
  openingHoursJson: z.record(z.string(), z.string()).nullish(),
  priceMin: optInt, priceMax: optInt, priceUnit: z.enum(['per_person', 'total', 'unknown']).default('unknown'),
  minParticipants: optInt, maxParticipants: optInt,
  soloFriendly: z.boolean().nullish(), joinOpenGroup: z.boolean().nullish(), requiresBooking: z.boolean().nullish(),
  indoorOutdoor: z.enum(['indoor', 'outdoor', 'both', 'unknown']).default('unknown'),
  durationMinutes: optInt,
  sourceUrl: url,
  verifiedAt: z.coerce.date().nullish(),
  media,
});

export const eventInput = z.object({
  ...base,
  placeId: z.string().uuid().nullish(),
  startsAt: z.coerce.date(), endsAt: z.coerce.date().nullish(),
  priceMin: optInt, priceMax: optInt, priceUnit: z.enum(['per_person', 'total', 'unknown']).default('unknown'),
  ticketsUrl: optUrl,
  capacity: optInt,
  indoorOutdoor: z.enum(['indoor', 'outdoor', 'both', 'unknown']).nullish(),
  soloFriendly: z.boolean().nullish(), joinOpenGroup: z.boolean().nullish(), requiresBooking: z.boolean().nullish(),
  sourceUrl: url,
  verifiedAt: z.coerce.date().nullish(),
  expiresAt: z.coerce.date().nullish(),
  occurrences: z.array(z.object({
    startsAt: z.coerce.date(), endsAt: z.coerce.date().nullish(),
    status: z.enum(['published', 'cancelled', 'sold_out']).default('published'), ticketsUrl: optUrl,
  })).default([]),
  media,
});

export const activityInput = z.object({
  ...base,
  stepsRichText: z.string().max(10000).nullish(),
  durationMinutes: optInt, costMin: optInt, costMax: optInt,
  requiredMaterialsJson: z.array(z.string().max(200)).nullish(),
  minParticipants: optInt, maxParticipants: optInt,
  sourceUrl: optUrl,
  media,
});

export const inputByType = { place: placeInput, event: eventInput, activity: activityInput } as const;
export type PlaceInput = z.infer<typeof placeInput>;
export type EventInput = z.infer<typeof eventInput>;
export type ActivityInput = z.infer<typeof activityInput>;

export interface PublishIssue { field: string; message: string }

/**
 * Обязательные условия публикации (§10): название, slug, описание, категория/теги, источник,
 * адрес (места), время (события). Для событий — verifiedAt: без проверки в актуальную подборку не попадёт.
 * Демо-записи публикуются как есть, но фильтруются в production.
 */
export function publishIssues(type: 'place' | 'event' | 'activity', v: Record<string, unknown>): PublishIssue[] {
  const issues: PublishIssue[] = [];
  const need = (field: string, ok: boolean, message: string) => { if (!ok) issues.push({ field, message }); };
  const tags = (v.tags as string[] | undefined) ?? [];
  if (type !== 'activity') need('tags', tags.some((t) => (DIRECTION_TAGS as readonly string[]).includes(t)), 'Нужен минимум один тег-направление (прогулки, заведения, игры, культура, спокойный отдых)');
  else need('tags', tags.length > 0, 'Нужен минимум один тег');
  if (type === 'place') {
    need('address', !!v.address, 'Укажите адрес');
    need('sourceUrl', !!v.sourceUrl, 'Укажите ссылку на первоисточник');
  }
  if (type === 'event') {
    need('startsAt', !!v.startsAt, 'Укажите дату и время');
    need('sourceUrl', !!v.sourceUrl, 'Укажите ссылку на первоисточник');
    need('verifiedAt', !!v.verifiedAt, 'Отметьте, когда данные проверены по первоисточнику');
  }
  return issues;
}

export const catalogQuery = z.object({
  type: z.enum(['place', 'event', 'activity']).default('place'),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  category: z.string().optional().refine((c) => !c || TAG_KEYS.has(c), 'Неизвестная категория'),
  priceMax: z.coerce.number().int().min(0).max(1_000_000).optional(),
  q: z.string().trim().max(80).optional(),
  page: z.coerce.number().int().min(1).max(1000).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(12),
});
export type CatalogQuery = z.infer<typeof catalogQuery>;
