import type { QuizAnswers } from '@/features/quiz/types';

/**
 * Таблица соответствия ответов теста тегам каталога (DECISIONS G-05). Единственное место, где ответ
 * превращается в требования к контенту. Все ключи тегов должны быть в tag-registry (проверяется тестом).
 *
 * kind:
 *  - subtype    — какой именно формат/тип выбран (строгая стадия подборки требует совпадения);
 *  - intensity  — нагрузка, азарт, усилия (критерий «энергия»);
 *  - atmosphere — желаемая атмосфера, общение (критерий «атмосфера»).
 */
export type ReqKind = 'subtype' | 'intensity' | 'atmosphere';
export interface Req { step: string; answer: string; tags: string[]; kind: ReqKind }

type Entry = { tags: string[]; kind: ReqKind };
const E = (kind: ReqKind, ...tags: string[]): Entry => ({ kind, tags });

const TABLE: Record<string, Record<string, Entry[]>> = {
  W1: {
    scenic: [E('subtype', 'walk_scenic')],
    explore: [E('subtype', 'walk_explore')],
    active: [E('subtype', 'walk_active'), E('intensity', 'load_medium', 'load_high')],
    escape: [E('subtype', 'walk_escape', 'outskirts')],
  },
  W2: { near: [E('subtype', 'in_city')], outskirts: [E('subtype', 'outskirts')] },
  V1: {
    food_talk: [E('subtype', 'venue_food_talk')], play: [E('subtype', 'venue_play', 'games')],
    music: [E('subtype', 'venue_music')], quiet: [E('subtype', 'venue_quiet')], unusual: [E('subtype', 'venue_unusual')],
  },
  V2: {
    sit: [E('intensity', 'load_sit')], some: [E('intensity', 'load_light', 'load_medium')], active: [E('intensity', 'load_high', 'load_medium')],
  },
  G1: {
    mind: [E('subtype', 'game_mind')], physical: [E('subtype', 'game_physical')],
    digital: [E('subtype', 'game_digital')], social: [E('subtype', 'game_social')],
  },
  G2_MIND: { quiz: [E('subtype', 'game_quiz')], escape: [E('subtype', 'game_escape')], strategy: [E('subtype', 'game_strategy')] },
  G2_PHYSICAL: { light: [E('intensity', 'load_light')], medium: [E('intensity', 'load_medium')], high: [E('intensity', 'load_high')] },
  G2_DIGITAL: { vr: [E('subtype', 'game_vr')], arcade: [E('subtype', 'game_arcade')], console: [E('subtype', 'game_console')] },
  G2_SOCIAL: { boardgames: [E('subtype', 'game_boardgames')], party: [E('subtype', 'game_party')], performance: [E('subtype', 'game_performance')] },
  G3: {
    competitive: [E('intensity', 'comp_competitive')], friendly: [E('intensity', 'comp_friendly')],
    cooperative: [E('intensity', 'comp_cooperative')],
  },
  C1: {
    visual: [E('subtype', 'culture_visual')], story: [E('subtype', 'culture_story')],
    make: [E('subtype', 'culture_make')], unusual: [E('subtype', 'culture_unusual')],
  },
  C2: { watch: [E('subtype', 'fmt_watch')], participate: [E('subtype', 'fmt_participate')] },
  R1: { body: [E('subtype', 'well_body')], cozy: [E('subtype', 'well_cozy')], mind: [E('subtype', 'well_mind')], light: [E('subtype', 'well_light')] },
  R2: { minimal: [E('atmosphere', 'social_minimal')], close: [E('atmosphere', 'social_close')] },
  H1: { games: [E('subtype', 'home_games')], cook: [E('subtype', 'home_cook')], create: [E('subtype', 'home_create')], cozy: [E('subtype', 'home_cozy')] },
  H2: { minimal: [E('intensity', 'effort_minimal')], some: [E('intensity', 'effort_some')], project: [E('intensity', 'effort_project')] },
};

/** Ответы «любой/неважно/удивите» в таблице отсутствуют — они нейтральны, а не отрицательны. */
export function branchRequirements(branch: QuizAnswers['branchAnswers']): Req[] {
  const out: Req[] = [];
  for (const [step, answer] of Object.entries(branch ?? {})) {
    for (const e of TABLE[step]?.[answer] ?? []) out.push({ step, answer, tags: e.tags, kind: e.kind });
  }
  return out;
}

export const ALL_MAPPED_TAGS: string[] = [...new Set(Object.values(TABLE).flatMap((m) => Object.values(m).flatMap((es) => es.flatMap((e) => e.tags))))];

/** Соседние направления для «Похожих идей» (§8.9). */
export const NEIGHBOR_DIRECTIONS: Record<string, string[]> = {
  walks: ['culture', 'wellness'],
  venues: ['games', 'culture'],
  games: ['venues', 'culture'],
  culture: ['walks', 'venues'],
  wellness: ['walks', 'venues'],
  home: [],
};

export const SOCIAL_ENERGY_TAG: Record<string, string | null> = {
  high: 'energy_high', medium: 'energy_medium', low: 'energy_low', any: null,
};
