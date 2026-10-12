import { getStep } from './config';
import { START_STEP, TERMINAL_STEP, type AnswerValue, type QuizAnswers, type StepDef, type StepId } from './types';

const MAX_STEPS = 64; // guard against a cyclic config; the unit test proves there are none

export function readAnswer(step: StepDef, a: QuizAnswers): AnswerValue | undefined {
  const w = step.writesTo;
  if (!w) return undefined;
  if (w.startsWith('branchAnswers.')) return a.branchAnswers?.[w.slice('branchAnswers.'.length)];
  return a[w as Exclude<keyof QuizAnswers, 'branchAnswers'>] as AnswerValue | undefined;
}

export function writeAnswer(step: StepDef, a: QuizAnswers, value: AnswerValue | undefined): QuizAnswers {
  const w = step.writesTo;
  if (!w) return a;
  const out: QuizAnswers = { ...a };
  if (w.startsWith('branchAnswers.')) {
    const key = w.slice('branchAnswers.'.length);
    const ba = { ...(a.branchAnswers ?? {}) };
    if (value === undefined) delete ba[key]; else ba[key] = value as string;
    if (Object.keys(ba).length) out.branchAnswers = ba; else delete out.branchAnswers;
  } else if (value === undefined) {
    delete (out as Record<string, unknown>)[w];
  } else {
    (out as Record<string, unknown>)[w] = value;
  }
  return out;
}

export interface PathResult {
  /** steps from the start up to and including the first unanswered one (or RESULTS) */
  path: StepId[];
  /** first step without an answer, null when RESULTS was reached */
  pending: StepId | null;
}

/** Deterministic walk from COMMON.Q1 driven only by `answers`. */
export function walkPath(a: QuizAnswers): PathResult {
  const path: StepId[] = [];
  let id: StepId = START_STEP;
  for (let i = 0; i < MAX_STEPS; i++) {
    path.push(id);
    const step = getStep(id);
    if (step.kind === 'terminal') return { path, pending: null };
    if (readAnswer(step, a) === undefined) return { path, pending: id };
    id = step.next(a);
  }
  throw new Error('Quiz graph did not terminate');
}

export function nextStepAfter(id: StepId, a: QuizAnswers): StepId {
  return getStep(id).next(a);
}

export function isTerminal(id: StepId): boolean {
  return id === TERMINAL_STEP;
}

/** Fills values that are derived rather than asked (spec §4, §7). Pure. */
export function finalizeAnswers(a: QuizAnswers): QuizAnswers {
  const out = { ...a };
  if (a.companion === 'solo') out.partySize = 1;
  if (a.companion === 'friend' || a.companion === 'partner') out.partySize = 2;
  if (a.budgetBasis === undefined) out.budgetBasis = 'per_person';
  return out;
}
