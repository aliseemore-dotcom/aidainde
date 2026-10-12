import { getStep } from './config';
import { readAnswer, walkPath, writeAnswer, nextStepAfter } from './graph';
import { answerSchemaFor, normalizeInput, persistedStateSchema } from './schema';
import {
  QUIZ_SCHEMA_VERSION, QUIZ_TYPE_MAIN, START_STEP,
  type AnswerValue, type QuizAnswers, type StepId,
} from './types';

/** Serializable (no functions). `visitedStepIds` is the history shown by "Назад". */
export interface QuizState {
  schemaVersion: number;
  quizType: typeof QUIZ_TYPE_MAIN;
  currentStepId: StepId;
  answers: QuizAnswers;
  visitedStepIds: StepId[];
}

export function initialState(): QuizState {
  return { schemaVersion: QUIZ_SCHEMA_VERSION, quizType: QUIZ_TYPE_MAIN, currentStepId: START_STEP, answers: {}, visitedStepIds: [] };
}

export class InvalidAnswerError extends Error {
  constructor(public stepId: StepId) { super(`INVALID_ANSWER: ${stepId}`); }
}

/**
 * Answer `stepId` (the current step, or an earlier visited one being changed).
 * If an already answered step gets a different value, every answer after it on the old path is dropped
 * (spec §8.10: simple full clearing of later steps). Then the quiz moves to the next step.
 */
export function answerStep(state: QuizState, stepId: StepId, rawValue: unknown): QuizState {
  const step = getStep(stepId);
  const allowed = stepId === state.currentStepId || state.visitedStepIds.includes(stepId);
  if (!allowed || step.kind === 'terminal') throw new InvalidAnswerError(stepId);

  const value = normalizeInput(step, rawValue);
  if (!answerSchemaFor(step, state.answers).safeParse(value).success) throw new InvalidAnswerError(stepId);

  const previous = readAnswer(step, state.answers);
  let answers = state.answers;
  if (!sameValue(previous, value as AnswerValue)) {
    const oldPath = walkPath(state.answers).path;
    for (const later of oldPath.slice(oldPath.indexOf(stepId) + 1)) {
      answers = writeAnswer(getStep(later), answers, undefined);
    }
    answers = writeAnswer(step, answers, value as AnswerValue);
  }

  const path = walkPath(answers).path;
  const idx = path.indexOf(stepId);
  const nextId = nextStepAfter(stepId, answers);
  return {
    ...state,
    answers,
    currentStepId: nextId,
    visitedStepIds: path.slice(0, idx + 1),
  };
}

/** Back: previous step, its answer stays selected. No-op on the first step. */
export function goBack(state: QuizState): QuizState {
  const prev = state.visitedStepIds[state.visitedStepIds.length - 1];
  if (!prev) return state;
  return { ...state, currentStepId: prev, visitedStepIds: state.visitedStepIds.slice(0, -1) };
}

export type RestoreResult =
  | { ok: true; state: QuizState }
  | { ok: false; reason: 'STALE_QUIZ_VERSION' | 'INVALID_STATE' };

/** Restores a draft from storage; never trusts it. */
export function restoreState(raw: unknown): RestoreResult {
  const parsed = persistedStateSchema.safeParse(raw);
  if (!parsed.success) {
    const v = (raw as { schemaVersion?: unknown } | null)?.schemaVersion;
    return { ok: false, reason: typeof v === 'number' && v !== QUIZ_SCHEMA_VERSION ? 'STALE_QUIZ_VERSION' : 'INVALID_STATE' };
  }
  if (parsed.data.schemaVersion !== QUIZ_SCHEMA_VERSION) return { ok: false, reason: 'STALE_QUIZ_VERSION' };

  // rebuild by replaying answers along the path: guarantees consistency of the restored draft
  let state = initialState();
  const a = parsed.data.answers as QuizAnswers;
  try {
    for (let i = 0; i < 64; i++) {
      const step = getStep(state.currentStepId);
      if (step.kind === 'terminal') break;
      const v = readAnswer(step, a);
      if (v === undefined) break;
      state = answerStep(state, step.id, v);
    }
  } catch {
    return { ok: false, reason: 'INVALID_STATE' };
  }
  // anything stored outside the replayed path means the draft was inconsistent
  if (JSON.stringify(sortKeys(state.answers)) !== JSON.stringify(sortKeys(a))) return { ok: false, reason: 'INVALID_STATE' };
  return { ok: true, state };
}

function sameValue(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
function sortKeys(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (v && typeof v === 'object') {
    return Object.fromEntries(Object.entries(v as object).sort(([x], [y]) => x.localeCompare(y)).map(([k, x]) => [k, sortKeys(x)]));
  }
  return v;
}
