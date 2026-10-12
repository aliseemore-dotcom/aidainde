export const QUIZ_SCHEMA_VERSION = 1;
export const QUIZ_TYPE_MAIN = 'main';
export const START_STEP = 'COMMON.Q1';
export const TERMINAL_STEP = 'RESULTS';

export type SocialEnergy = 'high' | 'medium' | 'low' | 'any';
export type Companion = 'solo' | 'friend' | 'group' | 'family' | 'partner';
export type Mood = 'excitement' | 'discovery' | 'relax' | 'connection' | 'surprise';
export type Setting = 'outside' | 'indoor' | 'home' | 'any';
export type Direction = 'walks' | 'venues' | 'games' | 'culture' | 'wellness' | 'home';
export type DayChoice = 'today' | 'tomorrow' | 'weekend' | 'date';
export type BudgetTier = 'free' | 'low' | 'mid' | 'high' | 'any';
export type BudgetBasis = 'per_person' | 'total';
export type Transport = 'walking_transit' | 'car' | 'any';
export type ChildAgeBand = '0-3' | '4-6' | '7-12' | '13-17';

export type QuizAnswers = {
  socialEnergy?: SocialEnergy;
  companion?: Companion;
  mood?: Mood;
  setting?: Setting;
  direction?: Direction;
  /** key = local step id inside a branch, e.g. W1, G2_MIND */
  branchAnswers?: Record<string, string>;
  dayChoice?: DayChoice;
  /** ISO local date YYYY-MM-DD. Only for dayChoice='date'; today/tomorrow/weekend are resolved on the server. */
  targetDate?: string;
  budgetTier?: BudgetTier;
  budgetBasis?: BudgetBasis;
  partySize?: number;
  /** undefined = not asked yet, [] = "Без детей" */
  childAgeBands?: ChildAgeBand[];
  transport?: Transport;
};

export type StepId = string;
export type StepKind = 'single' | 'multi' | 'number' | 'date' | 'terminal';

export type AnswerKey = Exclude<keyof QuizAnswers, 'branchAnswers'>;
export type AnswerPath = AnswerKey | `branchAnswers.${string}`;
export type AnswerValue = string | number | string[];

export interface Option {
  /** business value; UI text lives only in `label` */
  value: string;
  label: string;
}

export interface StepDef {
  id: StepId;
  kind: StepKind;
  title: string;
  titleResolver?: (a: QuizAnswers) => string;
  options?: readonly Option[];
  optionsResolver?: (a: QuizAnswers) => readonly Option[];
  range?: (a: QuizAnswers) => { min: number; max: number };
  /** null only for the terminal step */
  writesTo: AnswerPath | null;
  required: boolean;
  /** conditional steps only; absent = always visible when reached */
  visibilityRule?: (a: QuizAnswers) => boolean;
  /** pure function of validated answers (this step's answer included) */
  next: (a: QuizAnswers) => StepId;
  /** every id `next` may return; used for static graph analysis */
  nextCandidates: readonly StepId[];
}
