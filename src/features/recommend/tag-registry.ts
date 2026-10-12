/**
 * Единый словарь тегов (DECISIONS G-05). Админка выбирает теги только отсюда; seed заполняет таблицу `tags`
 * этим списком; движок сопоставляет с ним ответы теста (`tag-map.ts`). Новые теги — только через этот файл.
 */
export type TagGroup =
  | 'category' | 'mood' | 'energy' | 'company' | 'format' | 'setting'
  | 'accessibility' | 'physicalLoad' | 'gameStyle' | 'competitionMode';

export interface TagDef { key: string; label: string; group: TagGroup }

const t = (group: TagGroup, key: string, label: string): TagDef => ({ key, label, group });

export const TAGS: readonly TagDef[] = [
  // направления
  t('category', 'walks', 'Прогулки'), t('category', 'venues', 'Заведения'), t('category', 'games', 'Игры'),
  t('category', 'culture', 'Культура'), t('category', 'wellness', 'Спокойный отдых'), t('category', 'home', 'Дома'),
  // прогулки
  t('category', 'walk_scenic', 'Красивые виды'), t('category', 'walk_explore', 'Исследовать'),
  t('category', 'walk_active', 'Активная прогулка'), t('category', 'walk_escape', 'За город'),
  t('category', 'in_city', 'В черте города'), t('category', 'outskirts', 'За городом'),
  // заведения
  t('category', 'venue_food_talk', 'Еда и разговоры'), t('category', 'venue_play', 'Игры в заведении'),
  t('category', 'venue_music', 'Музыка'), t('category', 'venue_quiet', 'Тихо и уютно'), t('category', 'venue_unusual', 'Необычное'),
  // игры
  t('gameStyle', 'game_mind', 'Головоломки'), t('gameStyle', 'game_quiz', 'Квиз'), t('gameStyle', 'game_escape', 'Квест'),
  t('gameStyle', 'game_strategy', 'Стратегии'), t('gameStyle', 'game_physical', 'Активные игры'),
  t('gameStyle', 'game_digital', 'Цифровые игры'), t('gameStyle', 'game_vr', 'VR'), t('gameStyle', 'game_arcade', 'Аркады'),
  t('gameStyle', 'game_console', 'Консоли'), t('gameStyle', 'game_social', 'Весёлые игры'),
  t('gameStyle', 'game_boardgames', 'Настольные игры'), t('gameStyle', 'game_party', 'Командные игры'),
  t('gameStyle', 'game_performance', 'Караоке и интерактив'),
  t('competitionMode', 'comp_competitive', 'Соревнование'), t('competitionMode', 'comp_friendly', 'Дружеский азарт'),
  t('competitionMode', 'comp_cooperative', 'Вместе против задачи'),
  // культура
  t('category', 'culture_visual', 'Искусство и архитектура'), t('category', 'culture_story', 'Театр, кино, лекции'),
  t('category', 'culture_make', 'Творческое занятие'), t('category', 'culture_unusual', 'Необычное'),
  t('format', 'fmt_watch', 'Смотреть и слушать'), t('format', 'fmt_participate', 'Участвовать самому'),
  // спокойный отдых
  t('category', 'well_body', 'Расслабить тело'), t('category', 'well_cozy', 'Уют и напиток'),
  t('category', 'well_mind', 'Тихое культурное'), t('category', 'well_light', 'Лёгкое движение'),
  // дома
  t('category', 'home_games', 'Домашние игры'), t('category', 'home_cook', 'Кулинария'),
  t('category', 'home_create', 'Творчество'), t('category', 'home_cozy', 'Уютный вечер'),
  t('format', 'effort_minimal', 'Почти без подготовки'), t('format', 'effort_some', 'Немного подготовки'),
  t('format', 'effort_project', 'Мини-проект'),
  // настроение
  t('mood', 'mood_excitement', 'Движуха'), t('mood', 'mood_discovery', 'Вдохновение'), t('mood', 'mood_relax', 'Отдых'),
  t('mood', 'mood_connection', 'Общение'), t('mood', 'mood_surprise', 'Неожиданное'),
  // энергия общения
  t('energy', 'energy_high', 'Людно и шумно'), t('energy', 'energy_medium', 'Для своих'), t('energy', 'energy_low', 'Тихо, можно одному'),
  // компания
  t('company', 'company_solo', 'Можно одному'), t('company', 'company_friend', 'Для двоих друзей'),
  t('company', 'company_group', 'Для компании'), t('company', 'company_family', 'Для семьи'),
  t('company', 'company_partner', 'Для пары'),
  t('company', 'social_minimal', 'Минимум общения'), t('company', 'social_close', 'Общение со своими'),
  // нагрузка
  t('physicalLoad', 'load_sit', 'Сидя'), t('physicalLoad', 'load_light', 'Лёгкая нагрузка'),
  t('physicalLoad', 'load_medium', 'Средняя нагрузка'), t('physicalLoad', 'load_high', 'Высокая нагрузка'),
  // доступность
  t('accessibility', 'transit_accessible', 'Доехать на транспорте'), t('accessibility', 'car_required', 'Нужна машина'),
  t('accessibility', 'adult_only', 'Только 18+'), t('accessibility', 'step_free', 'Без ступенек'),
];

export const TAG_KEYS: ReadonlySet<string> = new Set(TAGS.map((x) => x.key));
export const TAG_BY_KEY: ReadonlyMap<string, TagDef> = new Map(TAGS.map((x) => [x.key, x]));
export const tagLabel = (key: string): string => TAG_BY_KEY.get(key)?.label ?? key;

/** Теги, которые считаются «направлением» контента (необходим минимум один при публикации — §10). */
export const DIRECTION_TAGS = ['walks', 'venues', 'games', 'culture', 'wellness', 'home'] as const;

/** Иерархия подтипов игр: ребёнок -> родитель. Нужна, чтобы выбирать самый конкретный тег. */
export const TAG_PARENT: Readonly<Record<string, string>> = {
  game_quiz: 'game_mind', game_escape: 'game_mind', game_strategy: 'game_mind',
  game_vr: 'game_digital', game_arcade: 'game_digital', game_console: 'game_digital',
  game_boardgames: 'game_social', game_party: 'game_social', game_performance: 'game_social',
};

/** Самый конкретный тег из набора: тот, который не является родителем другого тега набора. */
export function mostSpecific(keys: string[]): string | undefined {
  const parents = new Set(keys.map((k) => TAG_PARENT[k]).filter((p): p is string => !!p));
  return keys.find((k) => !parents.has(k));
}
