import type { Option, QuizAnswers, StepDef, StepId } from '../types';
import { computeDirectionMenu } from '../direction';

const o = (value: string, label: string): Option => ({ value, label });

/** Fixed order of the closing screens (spec §7). Never changes between renders. */
export const TAIL_ORDER = [
  'COMMON.DATE',
  'COMMON.DATE_PICKER',
  'COMMON.BUDGET',
  'COMMON.BASIS',
  'COMMON.PARTY_SIZE',
  'COMMON.CHILD_AGES',
  'COMMON.TRANSPORT',
] as const;

export const TAIL_CANDIDATES: readonly StepId[] = [...TAIL_ORDER, 'RESULTS'];

const tailVisibility: Record<string, (a: QuizAnswers) => boolean> = {
  'COMMON.DATE': () => true,
  'COMMON.DATE_PICKER': (a) => a.dayChoice === 'date',
  'COMMON.BUDGET': () => true,
  // basis is meaningless for a free or "any" budget (DECISIONS D-05)
  'COMMON.BASIS': (a) => !!a.companion && a.companion !== 'solo' && a.budgetTier !== 'free' && a.budgetTier !== 'any',
  'COMMON.PARTY_SIZE': (a) => a.companion === 'group' || a.companion === 'family',
  'COMMON.CHILD_AGES': (a) => a.companion === 'family',
  'COMMON.TRANSPORT': (a) =>
    a.direction === 'walks' && (a.branchAnswers?.W1 === 'escape' || a.branchAnswers?.W2 === 'outskirts'),
};

/** First visible tail step strictly after `from`, else RESULTS. */
export function nextTail(from: StepId, a: QuizAnswers): StepId {
  const i = TAIL_ORDER.indexOf(from as (typeof TAIL_ORDER)[number]);
  for (let j = i + 1; j < TAIL_ORDER.length; j++) {
    const id = TAIL_ORDER[j]!;
    if (tailVisibility[id]!(a)) return id;
  }
  return 'RESULTS';
}

const tail = (id: (typeof TAIL_ORDER)[number]) => ({
  visibilityRule: tailVisibility[id]!,
  next: (a: QuizAnswers) => nextTail(id, a),
  nextCandidates: TAIL_CANDIDATES.slice(TAIL_ORDER.indexOf(id) + 1),
});

export const DIRECTION_FIRST_STEP: Record<string, StepId> = {
  walks: 'BRANCH.WALKS.W1',
  venues: 'BRANCH.VENUES.V1',
  games: 'BRANCH.GAMES.G1',
  culture: 'BRANCH.CULTURE.C1',
  wellness: 'BRANCH.WELLNESS.R1',
};

export const PARTY_RANGE = {
  group: { min: 3, max: 30 },
  family: { min: 2, max: 30 }, // D-04: spec says 1–30 but forbids 1
} as const;

export const commonSteps: StepDef[] = [
  {
    id: 'COMMON.Q1', kind: 'single', writesTo: 'socialEnergy', required: true,
    title: 'Как у тебя сегодня с социальной батарейкой?',
    options: [
      o('high', 'Хочу людей и движухи'),
      o('medium', 'Только свои, пожалуйста'),
      o('low', 'Хочу побыть наедине'),
      o('any', 'Сам пока не понимаю'),
    ],
    next: () => 'COMMON.Q2', nextCandidates: ['COMMON.Q2'],
  },
  {
    id: 'COMMON.Q2', kind: 'single', writesTo: 'companion', required: true,
    title: 'Кого берём с собой в это маленькое приключение?',
    options: [
      o('solo', 'Я сегодня сам по себе'),
      o('friend', 'С другом или подругой'),
      o('group', 'Собираемся компанией'),
      o('family', 'С семьёй / с детьми'),
      o('partner', 'Вдвоём с близким человеком'),
    ],
    next: () => 'COMMON.Q3', nextCandidates: ['COMMON.Q3'],
  },
  {
    id: 'COMMON.Q3', kind: 'single', writesTo: 'mood', required: true,
    title: 'Представь, что вечер уже закончился. Что хочется сказать?',
    options: [
      o('excitement', 'Вот это мы оторвались!'),
      o('discovery', 'Давно так не вдохновлялся'),
      o('relax', 'Как же хорошо отдохнул'),
      o('connection', 'Как классно посидели и поболтали'),
      o('surprise', 'Неожиданно, но было круто!'),
    ],
    next: () => 'COMMON.Q4', nextCandidates: ['COMMON.Q4'],
  },
  {
    id: 'COMMON.Q4', kind: 'single', writesTo: 'setting', required: true,
    title: 'Куда сегодня тянет — подышать воздухом или спрятаться от мира?',
    options: [
      o('outside', 'На улицу, хочу свежего воздуха'),
      o('indoor', 'Под крышу, в тепло и уют'),
      o('home', 'Никуда не пойду, хочу дома'),
      o('any', 'Неважно, лишь бы было интересно'),
    ],
    next: (a) => (a.setting === 'home' ? 'BRANCH.HOME.H1' : 'COMMON.DIRECTION'),
    nextCandidates: ['BRANCH.HOME.H1', 'COMMON.DIRECTION'],
  },
  {
    id: 'COMMON.DIRECTION', kind: 'single', writesTo: 'direction', required: true,
    title: 'Кажется, я уловил настроение! К чему больше тянет?',
    visibilityRule: (a) => a.setting !== 'home',
    // the five selectable directions; the visible menu is computed by direction.ts
    options: [
      o('walks', 'Прогуляться и сменить картинку'),
      o('venues', 'Посидеть в интересном месте'),
      o('games', 'Поиграть и посоревноваться'),
      o('culture', 'Впечатлиться чем-то новым'),
      o('wellness', 'Спокойно перезагрузиться'),
    ],
    optionsResolver: (a) => computeDirectionMenu(a).primary.map((d) => o(d.value, d.label)),
    next: (a) => DIRECTION_FIRST_STEP[a.direction as string] ?? 'RESULTS',
    nextCandidates: Object.values(DIRECTION_FIRST_STEP),
  },
  {
    id: 'COMMON.DATE', kind: 'single', writesTo: 'dayChoice', required: true,
    title: 'Когда устраиваем приключение?',
    options: [
      o('today', 'Сегодня'),
      o('tomorrow', 'Завтра'),
      o('weekend', 'В ближайшие выходные'),
      o('date', 'Выбрать дату'),
    ],
    ...tail('COMMON.DATE'),
  },
  {
    id: 'COMMON.DATE_PICKER', kind: 'date', writesTo: 'targetDate', required: true,
    title: 'Выбери дату',
    ...tail('COMMON.DATE_PICKER'),
  },
  {
    id: 'COMMON.BUDGET', kind: 'single', writesTo: 'budgetTier', required: true,
    title: 'Насколько готовы разгуляться?',
    options: [
      o('free', 'Бесплатно'),
      o('low', 'До 1 000 ₽'),
      o('mid', 'До 3 000 ₽'),
      o('high', 'До 5 000 ₽'),
      o('any', 'Неважно, если оно того стоит'),
    ],
    ...tail('COMMON.BUDGET'),
  },
  {
    id: 'COMMON.BASIS', kind: 'single', writesTo: 'budgetBasis', required: true,
    title: 'Этот бюджет на человека или на всех?',
    options: [o('per_person', 'На человека'), o('total', 'На всех')],
    ...tail('COMMON.BASIS'),
  },
  {
    id: 'COMMON.PARTY_SIZE', kind: 'number', writesTo: 'partySize', required: true,
    title: 'Сколько вас будет?',
    titleResolver: (a) => (a.companion === 'family' ? 'Сколько всего человек?' : 'Сколько вас будет?'),
    range: (a) => (a.companion === 'family' ? PARTY_RANGE.family : PARTY_RANGE.group),
    ...tail('COMMON.PARTY_SIZE'),
  },
  {
    id: 'COMMON.CHILD_AGES', kind: 'multi', writesTo: 'childAgeBands', required: true,
    title: 'Какого возраста дети?',
    options: [
      o('0-3', '0–3'), o('4-6', '4–6'), o('7-12', '7–12'), o('13-17', '13–17'),
      o('none', 'Без детей'),
    ],
    ...tail('COMMON.CHILD_AGES'),
  },
  {
    id: 'COMMON.TRANSPORT', kind: 'single', writesTo: 'transport', required: true,
    title: 'Как будем добираться?',
    options: [
      o('walking_transit', 'Пешком / общественный транспорт'),
      o('car', 'На машине'),
      o('any', 'Любым способом'),
    ],
    ...tail('COMMON.TRANSPORT'),
  },
  {
    id: 'RESULTS', kind: 'terminal', writesTo: null, required: false,
    title: 'Результаты', next: () => 'RESULTS', nextCandidates: [],
  },
];
