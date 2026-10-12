import type { ContentDetail } from './queries';
import { tagLabel } from '@/features/recommend/tag-registry';

/** Публичное представление карточки: только безопасные поля (без служебных и внутренних ключей). */
export function publicView(d: ContentDetail) {
  const r = d.record as Record<string, unknown>;
  const pick = (...keys: string[]) => Object.fromEntries(keys.filter((k) => r[k] !== undefined && r[k] !== null).map((k) => [k, r[k]]));
  const common = {
    type: d.type, slug: d.slug, status: d.status, title: r.title, description: r.description,
    tags: d.tags.map((k) => ({ key: k, label: tagLabel(k) })),
    media: d.media,
    isDemo: d.isDemo,
  };
  if (d.type === 'place') return {
    ...common,
    ...pick('address', 'lat', 'lng', 'district', 'websiteUrl', 'bookingUrl', 'openingHoursJson', 'priceMin', 'priceMax', 'priceUnit', 'priceCurrency', 'ageMin', 'ageMax', 'minParticipants', 'maxParticipants', 'indoorOutdoor', 'durationMinutes', 'sourceUrl', 'verifiedAt', 'requiresBooking'),
    contacts: r.contactsJson ?? null,
  };
  if (d.type === 'event') return {
    ...common,
    ...pick('startsAt', 'endsAt', 'timezone', 'priceMin', 'priceMax', 'priceUnit', 'ticketsUrl', 'ageMin', 'ageMax', 'sourceUrl', 'verifiedAt', 'requiresBooking'),
    place: d.place, occurrences: d.occurrences,
  };
  return {
    ...common,
    ...pick('stepsRichText', 'durationMinutes', 'costMin', 'costMax', 'minParticipants', 'maxParticipants', 'ageMin', 'ageMax', 'sourceUrl'),
    materials: r.requiredMaterialsJson ?? [],
  };
}
export type PublicView = ReturnType<typeof publicView>;
