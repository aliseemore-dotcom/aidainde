import type { StepDef, StepId } from '../types';
import { commonSteps } from './common';
import { branchSteps } from './branches';

export const ALL_STEPS: readonly StepDef[] = [...commonSteps, ...branchSteps];
export const STEPS: ReadonlyMap<StepId, StepDef> = new Map(ALL_STEPS.map((s) => [s.id, s]));

export function getStep(id: StepId): StepDef {
  const s = STEPS.get(id);
  if (!s) throw new Error(`Unknown quiz step: ${id}`);
  return s;
}
