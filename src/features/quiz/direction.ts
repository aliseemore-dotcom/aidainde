import type { Direction, QuizAnswers } from './types';

export type SelectableDirection = Exclude<Direction, 'home'>;

/** Constant tie-break order (spec §5). */
export const TIE_BREAK: readonly SelectableDirection[] = ['games', 'venues', 'walks', 'culture', 'wellness'];

export const DIRECTION_LABELS: Record<SelectableDirection, string> = {
  walks: 'Прогуляться и сменить картинку',
  venues: 'Посидеть в интересном месте',
  games: 'Поиграть и посоревноваться',
  culture: 'Впечатлиться чем-то новым',
  wellness: 'Спокойно перезагрузиться',
};

type Pts = Partial<Record<SelectableDirection, number>>;

const BY_SETTING: Record<string, Pts> = {
  outside: { walks: 5 },
  indoor: { venues: 2, games: 2, culture: 2, wellness: 2 },
};
const BY_ENERGY: Record<string, Pts> = {
  high: { games: 3, venues: 2 },
  medium: { venues: 2, games: 1 },
  low: { walks: 2, wellness: 2, culture: 1 },
};
const BY_MOOD: Record<string, Pts> = {
  excitement: { games: 4 },
  discovery: { culture: 4, walks: 1 },
  relax: { wellness: 4, walks: 2 },
  connection: { venues: 4, games: 1 },
  surprise: { culture: 2, games: 2 },
};

/**
 * Directions that are strictly indoor / not offered by default when setting=outside,
 * and directions hidden when setting=indoor. See DECISIONS D-02.
 */
const HIDDEN_BY_SETTING: Record<string, readonly SelectableDirection[]> = {
  outside: ['venues', 'wellness'],
  indoor: ['walks'],
};

export const MENU_SIZE = 4;

export interface DirectionOption {
  value: SelectableDirection;
  label: string;
  score: number;
  /** true when the direction does not match the chosen setting (shown only via "show all") */
  mismatch: boolean;
}

export function scoreDirections(a: QuizAnswers): Record<SelectableDirection, number> {
  const s: Record<SelectableDirection, number> = { walks: 0, venues: 0, games: 0, culture: 0, wellness: 0 };
  for (const table of [BY_SETTING[a.setting ?? ''], BY_ENERGY[a.socialEnergy ?? ''], BY_MOOD[a.mood ?? '']]) {
    if (!table) continue;
    for (const [k, v] of Object.entries(table)) s[k as SelectableDirection] += v;
  }
  return s;
}

/**
 * `primary`: up to 4 directions allowed for the setting, by score then tie-break.
 * `all`: all five directions (ordered the same way), used by "show all directions";
 *        entries hidden by the setting carry `mismatch: true`.
 */
export function computeDirectionMenu(a: QuizAnswers): { primary: DirectionOption[]; all: DirectionOption[] } {
  const scores = scoreDirections(a);
  const hidden = HIDDEN_BY_SETTING[a.setting ?? ''] ?? [];
  const all = [...TIE_BREAK]
    .sort((x, y) => scores[y] - scores[x] || TIE_BREAK.indexOf(x) - TIE_BREAK.indexOf(y))
    .map<DirectionOption>((value) => ({
      value, label: DIRECTION_LABELS[value], score: scores[value], mismatch: hidden.includes(value),
    }));
  const primary = all.filter((d) => !d.mismatch).slice(0, MENU_SIZE);
  return { primary, all };
}
