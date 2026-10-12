import type { Db } from './client';
import { createContent } from '@/features/catalog/mutations';
import { addDays, kazanDay, KAZAN_UTC_OFFSET } from '@/lib/date-kazan';

const ADMIN = '00000000-0000-0000-0000-000000000000'; // системный автор сида
const SRC = 'https://example.com/demo';
const NOTE = ' Демо, вымышленная запись.';

/** Ближайший день недели (0=вс … 6=сб) строго после сегодня, в Казани, в ISO. */
function nextWeekday(now: Date, weekday: number, minDaysAhead = 1): string {
  const { iso, weekday: wd } = kazanDay(now);
  let d = (weekday - wd + 7) % 7;
  if (d < minDaysAhead) d += 7;
  return addDays(iso, d);
}
const at = (iso: string, hhmm: string) => new Date(`${iso}T${hhmm}:00${KAZAN_UTC_OFFSET}`);

/**
 * Демо-записи только для локальной разработки и тестов. Все вымышленные, помечены isDemo=true
 * и словами «Демо, вымышленная запись». В production не загружаются и не показываются (см. lib/env).
 */
export async function seedDemo(db: Db, now = new Date()): Promise<number> {
  const sat = nextWeekday(now, 6);
  const verifiedAt = now;
  const base = { isDemo: true, status: 'published' as const, sourceUrl: SRC, verifiedAt };
  const items: [Parameters<typeof createContent>[1], Record<string, unknown>][] = [
    ['place', { ...base, slug: 'demo-naberezhnaya', title: 'Демо: набережная для неспешной прогулки', description: 'Пример прогулки с видами и кофе.' + NOTE, address: 'Вымышленный адрес, 1', indoorOutdoor: 'outdoor', priceMin: 0, priceMax: 0, priceUnit: 'total', ageMin: 0, tags: ['walks', 'walk_scenic', 'in_city', 'transit_accessible', 'mood_relax', 'mood_discovery', 'energy_low', 'company_solo', 'company_friend', 'company_partner', 'company_family', 'load_light'] }],
    ['place', { ...base, slug: 'demo-ekotropa', title: 'Демо: экотропа за городом', description: 'Пример загородного маршрута, нужна машина.' + NOTE, address: 'Вымышленный адрес, 2', indoorOutdoor: 'outdoor', priceMin: 0, priceMax: 0, priceUnit: 'total', ageMin: 0, tags: ['walks', 'walk_escape', 'walk_active', 'outskirts', 'car_required', 'mood_relax', 'mood_discovery', 'energy_low', 'company_friend', 'company_family', 'company_group', 'load_medium'] }],
    ['place', { ...base, slug: 'demo-kofeynya', title: 'Демо: тихая кофейня', description: 'Пример уютного места для разговора.' + NOTE, address: 'Вымышленный адрес, 3', indoorOutdoor: 'indoor', priceUnit: 'unknown', tags: ['venues', 'venue_quiet', 'venue_food_talk', 'mood_connection', 'mood_relax', 'energy_low', 'energy_medium', 'company_solo', 'company_friend', 'company_partner', 'load_sit', 'transit_accessible'] }],
    ['place', { ...base, slug: 'demo-bar-18', title: 'Демо: бар 18+', description: 'Пример площадки только для взрослых.' + NOTE, address: 'Вымышленный адрес, 4', indoorOutdoor: 'indoor', priceMin: 1500, priceMax: 3000, priceUnit: 'per_person', ageMin: 18, tags: ['venues', 'venue_music', 'adult_only', 'mood_excitement', 'energy_high', 'company_friend', 'company_group', 'load_light'] }],
    ['place', { ...base, slug: 'demo-quiz-bar', title: 'Демо: квиз-вечер для компании', description: 'Пример командного квиза, нужна компания от четырёх.' + NOTE, address: 'Вымышленный адрес, 5', indoorOutdoor: 'indoor', priceMin: 500, priceMax: 500, priceUnit: 'per_person', minParticipants: 4, maxParticipants: 30, ageMin: 12, requiresBooking: true, soloFriendly: false, tags: ['games', 'game_mind', 'game_quiz', 'comp_friendly', 'comp_competitive', 'mood_excitement', 'mood_connection', 'energy_high', 'company_group', 'load_sit'] }],
    ['place', { ...base, slug: 'demo-nastolki', title: 'Демо: кафе с настольными играми', description: 'Пример кафе с настолками для друзей и семьи.' + NOTE, address: 'Вымышленный адрес, 6', indoorOutdoor: 'indoor', priceMin: 300, priceMax: 300, priceUnit: 'per_person', minParticipants: 2, maxParticipants: 12, ageMin: 6, soloFriendly: false, tags: ['games', 'venues', 'game_social', 'game_boardgames', 'game_mind', 'game_strategy', 'comp_friendly', 'comp_cooperative', 'mood_connection', 'mood_excitement', 'energy_medium', 'company_friend', 'company_group', 'company_family', 'load_sit', 'transit_accessible'] }],
    ['place', { ...base, slug: 'demo-vr-club', title: 'Демо: клуб виртуальной реальности', description: 'Пример VR-клуба, можно одному.' + NOTE, address: 'Вымышленный адрес, 7', indoorOutdoor: 'indoor', priceMin: 800, priceMax: 1200, priceUnit: 'per_person', minParticipants: 1, maxParticipants: 6, ageMin: 12, soloFriendly: true, tags: ['games', 'game_digital', 'game_vr', 'comp_friendly', 'mood_excitement', 'mood_surprise', 'energy_medium', 'company_solo', 'company_friend', 'company_group', 'load_light'] }],
    ['place', { ...base, slug: 'demo-muzey', title: 'Демо: музей для всей семьи', description: 'Пример музея с интерактивными залами.' + NOTE, address: 'Вымышленный адрес, 8', indoorOutdoor: 'indoor', priceMin: 400, priceMax: 400, priceUnit: 'per_person', ageMin: 0, tags: ['culture', 'culture_visual', 'fmt_watch', 'mood_discovery', 'energy_low', 'energy_medium', 'company_solo', 'company_friend', 'company_family', 'company_partner', 'load_light', 'step_free', 'transit_accessible'] }],
    ['place', { ...base, slug: 'demo-spa', title: 'Демо: спа и бани', description: 'Пример спокойной перезагрузки.' + NOTE, address: 'Вымышленный адрес, 9', indoorOutdoor: 'indoor', priceMin: 2500, priceMax: 4000, priceUnit: 'per_person', ageMin: 16, tags: ['wellness', 'well_body', 'well_cozy', 'social_minimal', 'social_close', 'mood_relax', 'energy_low', 'company_solo', 'company_friend', 'company_partner', 'load_sit'] }],
    ['event', { ...base, slug: 'demo-koncert', title: 'Демо: камерный концерт', description: 'Пример вечернего концерта.' + NOTE, startsAt: at(sat, '19:00'), endsAt: at(sat, '21:00'), indoorOutdoor: 'indoor', priceMin: 700, priceMax: 1500, priceUnit: 'per_person', ageMin: 6, tags: ['culture', 'culture_story', 'fmt_watch', 'mood_discovery', 'mood_relax', 'energy_low', 'energy_medium', 'company_solo', 'company_friend', 'company_family', 'company_partner', 'load_sit'] }],
    ['event', { ...base, slug: 'demo-masterklass', title: 'Демо: мастер-класс по керамике', description: 'Пример творческого занятия.' + NOTE, startsAt: at(sat, '15:00'), endsAt: at(sat, '17:00'), indoorOutdoor: 'indoor', priceMin: 1800, priceMax: 1800, priceUnit: 'per_person', capacity: 12, ageMin: 12, requiresBooking: true, tags: ['culture', 'culture_make', 'fmt_participate', 'mood_discovery', 'mood_surprise', 'energy_medium', 'company_solo', 'company_friend', 'company_group', 'load_light'] }],
    ['event', { ...base, slug: 'demo-otmenennoe', title: 'Демо: отменённое событие', description: 'Пример отменённого события — не рекомендуется.' + NOTE, status: 'cancelled', startsAt: at(sat, '12:00'), indoorOutdoor: 'indoor', priceMin: 0, priceMax: 0, priceUnit: 'total', tags: ['culture', 'culture_visual', 'mood_discovery'] }],
    ['activity', { ...base, slug: 'demo-nastolki-doma', title: 'Демо: вечер настолок дома', description: 'Пример домашнего игрового вечера.' + NOTE, stepsRichText: 'Выберите две-три игры.\n\n- Приготовьте закуски\n- Договоритесь о правилах', durationMinutes: 180, costMin: 0, costMax: 500, requiredMaterialsJson: ['Настольные игры', 'Закуски'], minParticipants: 2, maxParticipants: 8, ageMin: 6, sourceUrl: null, tags: ['home', 'home_games', 'effort_some', 'mood_connection', 'mood_excitement', 'energy_medium', 'company_friend', 'company_group', 'company_family', 'load_sit'] }],
    ['activity', { ...base, slug: 'demo-uzhin-doma', title: 'Демо: готовим эчпочмаки дома', description: 'Пример кулинарного мини-проекта.' + NOTE, stepsRichText: 'Замесите тесто.\n\n- Приготовьте начинку\n- Соберите и запеките', durationMinutes: 150, costMin: 400, costMax: 900, requiredMaterialsJson: ['Мука', 'Мясо', 'Картофель'], ageMin: 6, sourceUrl: null, tags: ['home', 'home_cook', 'effort_project', 'mood_discovery', 'mood_relax', 'energy_low', 'company_solo', 'company_friend', 'company_family', 'company_partner', 'load_light'] }],
    ['activity', { ...base, slug: 'demo-uyutny-vecher', title: 'Демо: уютный вечер с плейлистом', description: 'Пример спокойного вечера дома.' + NOTE, stepsRichText: 'Выберите фильм или плейлист.\n\n- Заварите чай', durationMinutes: 120, costMin: 0, costMax: 0, ageMin: 0, sourceUrl: null, tags: ['home', 'home_cozy', 'effort_minimal', 'mood_relax', 'energy_low', 'company_solo', 'company_partner', 'company_friend', 'company_family', 'load_sit'] }],
  ];
  for (const [type, data] of items) await createContent(db, type, data, ADMIN);
  return items.length;
}
