import { progressLabel } from '@/features/quiz/progress';

/** Без процентов: честная формулировка вместо фиксированной шкалы. */
export function Progress({ remaining, answered }: { remaining: number; answered: number }) {
  return <p className="t-meta" role="status" aria-live="polite">{progressLabel(remaining, answered)}</p>;
}
