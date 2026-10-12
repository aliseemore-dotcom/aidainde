import { z } from 'zod';
import { getStep, ALL_STEPS } from './config';
import { readAnswer, walkPath } from './graph';
import { QUIZ_SCHEMA_VERSION, QUIZ_TYPE_MAIN, type AnswerValue, type QuizAnswers, type StepDef } from './types';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((s) => {
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}, 'Invalid calendar date');

/** Zod schema for one step's answer, derived from the config (single source of truth). */
const staticSchemas = new Map<string, z.ZodType<AnswerValue>>();

export function answerSchemaFor(step: StepDef, a: QuizAnswers): z.ZodType<AnswerValue> {
  // number ranges depend on answers (party size); everything else is static per step
  if (step.kind === 'number') return buildSchema(step, a);
  let s = staticSchemas.get(step.id);
  if (!s) { s = buildSchema(step, a); staticSchemas.set(step.id, s); }
  return s;
}

function buildSchema(step: StepDef, a: QuizAnswers): z.ZodType<AnswerValue> {
  switch (step.kind) {
    case 'single': {
      const values = step.options!.map((o) => o.value) as [string, ...string[]];
      return z.enum(values);
    }
    case 'multi': {
      const values = step.options!.map((o) => o.value).filter((v) => v !== 'none') as [string, ...string[]];
      return z.array(z.enum(values)).refine((arr) => new Set(arr).size === arr.length, 'duplicates');
    }
    case 'number': {
      const { min, max } = step.range!(a);
      return z.number().int().min(min).max(max);
    }
    case 'date':
      return isoDate;
    default:
      return z.never();
  }
}

/** Normalises raw UI input into the domain value (CHILD_AGES: ["none", ...] => []). */
export function normalizeInput(step: StepDef, raw: unknown): unknown {
  if (step.kind === 'multi' && Array.isArray(raw) && raw.includes('none')) return [];
  return raw;
}

export type ValidationCode = 'INVALID_ANSWER' | 'INCOMPLETE' | 'STRAY_ANSWER';
export interface ValidationIssue { code: ValidationCode; stepId?: string; message: string }

/** Shape-only check for untrusted JSON (unknown keys rejected). */
export const quizAnswersShape = z.object({
  socialEnergy: z.string().optional(), companion: z.string().optional(), mood: z.string().optional(),
  setting: z.string().optional(), direction: z.string().optional(),
  branchAnswers: z.record(z.string(), z.string()).optional(),
  dayChoice: z.string().optional(), targetDate: z.string().optional(), budgetTier: z.string().optional(),
  budgetBasis: z.string().optional(), partySize: z.number().optional(),
  childAgeBands: z.array(z.string()).optional(), transport: z.string().optional(),
}).strict();

/**
 * Full validation of answers for POST /api/quiz/complete:
 * every step on the walked path is answered and valid, and nothing outside the path is stored.
 */
export function validateComplete(raw: unknown): { ok: true; answers: QuizAnswers } | { ok: false; issues: ValidationIssue[] } {
  const shape = quizAnswersShape.safeParse(raw);
  if (!shape.success) return { ok: false, issues: [{ code: 'INVALID_ANSWER', message: 'Malformed answers object' }] };
  const a = shape.data as QuizAnswers;
  const issues: ValidationIssue[] = [];

  // validate step by step so that an invalid value never drives a transition
  let id = 'COMMON.Q1';
  const onPath = new Set<string>();
  for (let i = 0; i < 64; i++) {
    const step = getStep(id);
    if (step.kind === 'terminal') break;
    onPath.add(id);
    const v = readAnswer(step, a);
    if (v === undefined) { issues.push({ code: 'INCOMPLETE', stepId: id, message: `Missing answer for ${id}` }); break; }
    if (!answerSchemaFor(step, a).safeParse(v).success) {
      issues.push({ code: 'INVALID_ANSWER', stepId: id, message: `Invalid answer for ${id}` });
      break;
    }
    id = step.next(a);
  }

  if (!issues.length) {
    const path = new Set(walkPath(a).path);
    for (const s of ALL_STEPS) {
      if (s.writesTo && readAnswer(s, a) !== undefined && !path.has(s.id)) {
        issues.push({ code: 'STRAY_ANSWER', stepId: s.id, message: `Answer for ${s.id} is not on the quiz path` });
      }
    }
    for (const k of Object.keys(a.branchAnswers ?? {})) {
      if (!ALL_STEPS.some((s) => s.writesTo === `branchAnswers.${k}`)) {
        issues.push({ code: 'STRAY_ANSWER', message: `Unknown branch answer ${k}` });
      }
    }
  }
  return issues.length ? { ok: false, issues } : { ok: true, answers: a };
}

export const persistedStateSchema = z.object({
  schemaVersion: z.number().int(),
  quizType: z.literal(QUIZ_TYPE_MAIN),
  currentStepId: z.string(),
  answers: quizAnswersShape,
  visitedStepIds: z.array(z.string()),
});

export { QUIZ_SCHEMA_VERSION };
