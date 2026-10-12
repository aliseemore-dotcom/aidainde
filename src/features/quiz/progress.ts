import { getStep } from './config';
import { readAnswer } from './graph';
import { TERMINAL_STEP, type QuizAnswers, type StepDef } from './types';

/**
 * Оценка числа оставшихся вопросов без ложных процентов: идём вперёд по «типичному» пути,
 * подставляя первое допустимое значение там, где ответа ещё нет. Оценка нижняя и приблизительная,
 * поэтому UI показывает слова («ещё пара вопросов»), а не доли.
 */
export function estimateRemaining(currentStepId: string, answers: QuizAnswers): number {
  let a = answers;
  let id = currentStepId;
  let n = 0;
  for (let i = 0; i < 32 && id !== TERMINAL_STEP; i++) {
    const step = getStep(id);
    n++;
    a = withTypicalAnswer(step, a);
    id = step.next(a);
  }
  return n;
}

function withTypicalAnswer(step: StepDef, a: QuizAnswers): QuizAnswers {
  if (readAnswer(step, a) !== undefined || !step.writesTo) return a;
  const first = step.optionsResolver?.(a)[0]?.value ?? step.options?.[0]?.value;
  const value: unknown = step.kind === 'number' ? step.range!(a).min : step.kind === 'multi' ? [] : step.kind === 'date' ? '2000-01-01' : first;
  if (value === undefined) return a;
  const w = step.writesTo;
  if (w.startsWith('branchAnswers.')) return { ...a, branchAnswers: { ...a.branchAnswers, [w.slice(14)]: value as string } };
  return { ...a, [w]: value };
}

export function progressLabel(remaining: number, answered: number): string {
  if (remaining <= 1) return 'Последний вопрос';
  if (remaining <= 3) return 'Ещё пара вопросов';
  return answered < 3 ? 'Начинаем' : 'Ещё несколько вопросов';
}
