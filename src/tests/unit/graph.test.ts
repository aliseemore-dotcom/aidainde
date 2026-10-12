import { describe, expect, it } from 'vitest';
import { ALL_STEPS, STEPS, getStep } from '@/features/quiz/config';
import { walkPath, finalizeAnswers, readAnswer, writeAnswer } from '@/features/quiz/graph';
import { computeDirectionMenu } from '@/features/quiz/direction';
import { validateComplete } from '@/features/quiz/schema';
import { answerStep, goBack, initialState, restoreState, InvalidAnswerError, type QuizState } from '@/features/quiz/state';
import { START_STEP, TERMINAL_STEP, type QuizAnswers, type StepDef } from '@/features/quiz/types';

// ---------- helpers ----------
function optionsOf(step: StepDef, a: QuizAnswers): string[] {
  const opts = step.optionsResolver ? step.optionsResolver(a) : step.options ?? [];
  return opts.map((o) => o.value);
}
/** representative values for a step: all options, or boundaries for number/date */
function sampleValues(step: StepDef, a: QuizAnswers): unknown[] {
  if (step.kind === 'single') return optionsOf(step, a);
  if (step.kind === 'number') { const r = step.range!(a); return [r.min, r.max]; }
  if (step.kind === 'date') return ['2026-10-13'];
  if (step.kind === 'multi') return [[], ['4-6'], ['0-3', '13-17']];
  return [];
}
/** answer the current step with its first sample until RESULTS */
function finishWithFirst(state: QuizState): QuizState {
  let s = state;
  for (let i = 0; i < 64 && s.currentStepId !== TERMINAL_STEP; i++) {
    const step = getStep(s.currentStepId);
    s = answerStep(s, step.id, sampleValues(step, s.answers)[0]);
  }
  return s;
}
const run = (pairs: [string, unknown][]) => pairs.reduce((s, [id, v]) => answerStep(s, id, v), initialState());

// ---------- static config integrity (spec §13) ----------
describe('quiz config', () => {
  it('step ids are globally unique and option values unique within a step', () => {
    expect(new Set(ALL_STEPS.map((s) => s.id)).size).toBe(ALL_STEPS.length);
    for (const s of ALL_STEPS) {
      const vals = (s.options ?? []).map((o) => o.value);
      expect(new Set(vals).size, s.id).toBe(vals.length);
    }
  });

  it('every visible choice step has >= 2 options; all steps have a unique writesTo', () => {
    for (const s of ALL_STEPS.filter((x) => x.kind === 'single' || x.kind === 'multi')) {
      expect((s.options ?? []).length, s.id).toBeGreaterThanOrEqual(2);
    }
    const w = ALL_STEPS.map((s) => s.writesTo).filter(Boolean);
    expect(new Set(w).size).toBe(w.length);
  });

  it('all declared transitions point to existing steps', () => {
    for (const s of ALL_STEPS) for (const c of s.nextCandidates) expect(STEPS.has(c), `${s.id} -> ${c}`).toBe(true);
  });

  it('static graph: acyclic, everything reachable from Q1, RESULTS is the only sink', () => {
    const color = new Map<string, 0 | 1 | 2>();
    const visit = (id: string) => {
      if (color.get(id) === 1) throw new Error(`cycle at ${id}`);
      if (color.get(id) === 2) return;
      color.set(id, 1);
      for (const n of getStep(id).nextCandidates) visit(n);
      color.set(id, 2);
    };
    visit(START_STEP);
    expect([...color.keys()].sort()).toEqual(ALL_STEPS.map((s) => s.id).sort());
    const sinks = ALL_STEPS.filter((s) => s.nextCandidates.length === 0).map((s) => s.id);
    expect(sinks).toEqual([TERMINAL_STEP]);
  });
});

// ---------- exhaustive transitions ----------
describe('transitions', () => {
  it('resolver output is always within declared nextCandidates (all option values of every step)', () => {
    for (const s of ALL_STEPS.filter((x) => x.kind !== 'terminal')) {
      const a0: QuizAnswers = { companion: 'family', dayChoice: 'date', budgetTier: 'low', direction: 'walks', setting: 'any' };
      for (const v of sampleValues(s, a0)) {
        const a = writeAnswer(s, a0, v as never);
        expect(s.nextCandidates, `${s.id}=${String(v)}`).toContain(s.next(a));
      }
    }
  });

  it('G1 routes to every G2 subtype / G3 and each G2 leads to G3', () => {
    const route = (v: string) => getStep('BRANCH.GAMES.G1').next({ branchAnswers: { G1: v } });
    expect(route('mind')).toBe('BRANCH.GAMES.G2_MIND');
    expect(route('physical')).toBe('BRANCH.GAMES.G2_PHYSICAL');
    expect(route('digital')).toBe('BRANCH.GAMES.G2_DIGITAL');
    expect(route('social')).toBe('BRANCH.GAMES.G2_SOCIAL');
    expect(route('surprise')).toBe('BRANCH.GAMES.G3');
    for (const sub of ['MIND', 'PHYSICAL', 'DIGITAL', 'SOCIAL']) {
      for (const v of optionsOf(getStep(`BRANCH.GAMES.G2_${sub}`), {})) {
        expect(getStep(`BRANCH.GAMES.G2_${sub}`).next({})).toBe('BRANCH.GAMES.G3');
        expect(v).toBeTruthy();
      }
    }
    expect(getStep('BRANCH.GAMES.G3').next({})).toBe('COMMON.DATE');
  });

  it('Q4=home enters the home branch and never an external one', () => {
    for (const e of ['high', 'medium', 'low', 'any'] as const)
      for (const c of ['solo', 'friend', 'group', 'family', 'partner'] as const)
        for (const m of ['excitement', 'discovery', 'relax', 'connection', 'surprise'] as const) {
          const s = run([['COMMON.Q1', e], ['COMMON.Q2', c], ['COMMON.Q3', m], ['COMMON.Q4', 'home']]);
          expect(s.currentStepId).toBe('BRANCH.HOME.H1');
          const done = finishWithFirst(s);
          expect(walkPath(done.answers).path.some((id) => id.startsWith('BRANCH.') && !id.startsWith('BRANCH.HOME'))).toBe(false);
          expect(done.answers.direction).toBeUndefined();
        }
  });
});

// ---------- 400 combinations (spec §14.3) ----------
describe('Q1×Q2×Q3×Q4 = 400 combinations', () => {
  const E = ['high', 'medium', 'low', 'any'] as const;
  const C = ['solo', 'friend', 'group', 'family', 'partner'] as const;
  const M = ['excitement', 'discovery', 'relax', 'connection', 'surprise'] as const;
  const S = ['outside', 'indoor', 'home', 'any'] as const;

  it('every combination reaches RESULTS through every allowed direction and branch path', () => {
    let combos = 0; let completePaths = 0;
    for (const e of E) for (const c of C) for (const m of M) for (const st of S) {
      combos++;
      const head = run([['COMMON.Q1', e], ['COMMON.Q2', c], ['COMMON.Q3', m], ['COMMON.Q4', st]]);
      if (st === 'home') {
        expect(head.currentStepId).toBe('BRANCH.HOME.H1');
      } else {
        expect(head.currentStepId).toBe('COMMON.DIRECTION');
        const menu = computeDirectionMenu(head.answers);
        expect(menu.primary.length, `${e}/${c}/${m}/${st}`).toBeGreaterThanOrEqual(2);
        expect(menu.primary.length).toBeLessThanOrEqual(4);
        expect(optionsOf(getStep('COMMON.DIRECTION'), head.answers).length).toBeGreaterThanOrEqual(2);
      }
      // follow EVERY branch path from here, completing the tail with each sample value
      const explore = (s: QuizState, depth: number): void => {
        if (s.currentStepId === TERMINAL_STEP) {
          completePaths++;
          // validate the stored answers first; derived values are added only afterwards
          const v = validateComplete(s.answers);
          expect(v.ok, JSON.stringify(s.answers)).toBe(true);
          expect(validateComplete(finalizeAnswers(s.answers)).ok).toBe(false); // derived fields are not user answers
          return;
        }
        const step = getStep(s.currentStepId);
        // full branching only in head/branch steps; tail steps are covered by the tail test below
        const vals = step.id.startsWith('COMMON.') && step.id !== 'COMMON.DIRECTION'
          ? sampleValues(step, s.answers).slice(0, 1)
          : step.id === 'COMMON.DIRECTION' ? ['walks', 'venues', 'games', 'culture', 'wellness'] : sampleValues(step, s.answers);
        expect(vals.length, step.id).toBeGreaterThan(0);
        expect(depth).toBeLessThan(20);
        for (const v of vals) explore(answerStep(s, step.id, v), depth + 1);
      };
      explore(head, 0);
    }
    expect(combos).toBe(400);
    expect(completePaths).toBeGreaterThan(400 * 10);
    console.info(`combinations=${combos} complete paths=${completePaths}`);
  }, 120_000);

  it('direction menu never selects a direction by itself and respects the setting', () => {
    const h = (st: string) => computeDirectionMenu({ socialEnergy: 'any', mood: 'surprise', setting: st as never });
    expect(h('indoor').primary.map((d) => d.value)).not.toContain('walks');
    expect(h('outside').primary.map((d) => d.value)).toEqual(expect.arrayContaining(['walks', 'games']));
    expect(h('outside').primary.every((d) => !d.mismatch)).toBe(true);
    expect(h('any').all.length).toBe(5);
    expect(h('outside').all.find((d) => d.value === 'venues')?.mismatch).toBe(true);
  });

  it('direction scoring is deterministic with the fixed tie-break', () => {
    const a: QuizAnswers = { socialEnergy: 'any', mood: 'surprise', setting: 'any' };
    // scores: culture 2, games 2 -> games first by tie-break
    expect(computeDirectionMenu(a).all.map((d) => d.value)).toEqual(['games', 'culture', 'venues', 'walks', 'wellness']);
    // spec formula spot check: outside+low+relax => walks 5+2+2=9, wellness 2+4=6
    const b = computeDirectionMenu({ setting: 'outside', socialEnergy: 'low', mood: 'relax' });
    expect(b.all.find((d) => d.value === 'walks')?.score).toBe(9);
    expect(b.all.find((d) => d.value === 'wellness')?.score).toBe(6);
  });
});

// ---------- closing screens (spec §7) ----------
describe('closing screens', () => {
  const base = (companion: string, dir: string, branch: [string, string][]) => {
    let s = run([['COMMON.Q1', 'any'], ['COMMON.Q2', companion], ['COMMON.Q3', 'relax'], ['COMMON.Q4', 'any'], ['COMMON.DIRECTION', dir]]);
    for (const [id, v] of branch) s = answerStep(s, id, v);
    return s;
  };
  const tailOf = (s: QuizState, picks: Record<string, unknown>) => {
    const seen: string[] = [];
    let cur = s;
    while (cur.currentStepId !== TERMINAL_STEP) {
      seen.push(cur.currentStepId);
      const step = getStep(cur.currentStepId);
      cur = answerStep(cur, step.id, picks[step.id] ?? sampleValues(step, cur.answers)[0]);
    }
    return seen;
  };

  it('order is fixed and conditional screens appear only when needed', () => {
    const solo = base('solo', 'culture', [['BRANCH.CULTURE.C1', 'visual'], ['BRANCH.CULTURE.C2', 'watch']]);
    expect(tailOf(solo, {})).toEqual(['COMMON.DATE', 'COMMON.BUDGET']);

    const fam = base('family', 'walks', [['BRANCH.WALKS.W1', 'escape'], ['BRANCH.WALKS.W2', 'outskirts']]);
    expect(tailOf(fam, { 'COMMON.DATE': 'date', 'COMMON.BUDGET': 'mid' })).toEqual([
      'COMMON.DATE', 'COMMON.DATE_PICKER', 'COMMON.BUDGET', 'COMMON.BASIS',
      'COMMON.PARTY_SIZE', 'COMMON.CHILD_AGES', 'COMMON.TRANSPORT',
    ]);

    const grp = base('group', 'games', [['BRANCH.GAMES.G1', 'surprise'], ['BRANCH.GAMES.G3', 'any']]);
    expect(tailOf(grp, { 'COMMON.BUDGET': 'low' })).toEqual(['COMMON.DATE', 'COMMON.BUDGET', 'COMMON.BASIS', 'COMMON.PARTY_SIZE']);
  });

  it('transport is asked for walks.escape OR walks.outskirts only', () => {
    const t = (w1: string, w2: string) =>
      tailOf(base('solo', 'walks', [['BRANCH.WALKS.W1', w1], ['BRANCH.WALKS.W2', w2]]), {}).includes('COMMON.TRANSPORT');
    expect(t('escape', 'near')).toBe(true);
    expect(t('scenic', 'outskirts')).toBe(true);
    expect(t('scenic', 'near')).toBe(false);
  });

  it('party size ranges and child ages semantics', () => {
    const fam = base('family', 'culture', [['BRANCH.CULTURE.C1', 'visual'], ['BRANCH.CULTURE.C2', 'any']]);
    let s = answerStep(answerStep(fam, 'COMMON.DATE', 'today'), 'COMMON.BUDGET', 'mid');
    s = answerStep(s, 'COMMON.BASIS', 'total');
    expect(() => answerStep(s, 'COMMON.PARTY_SIZE', 1)).toThrow(InvalidAnswerError);
    expect(() => answerStep(s, 'COMMON.PARTY_SIZE', 31)).toThrow(InvalidAnswerError);
    s = answerStep(s, 'COMMON.PARTY_SIZE', 4);
    expect(() => answerStep(s, 'COMMON.CHILD_AGES', ['5-9'])).toThrow(InvalidAnswerError);
    expect(answerStep(s, 'COMMON.CHILD_AGES', ['4-6', 'none']).answers.childAgeBands).toEqual([]);
    expect(answerStep(s, 'COMMON.CHILD_AGES', ['4-6', '0-3']).answers.childAgeBands).toEqual(['4-6', '0-3']);

    const grp = base('group', 'culture', [['BRANCH.CULTURE.C1', 'visual'], ['BRANCH.CULTURE.C2', 'any']]);
    let g = answerStep(answerStep(answerStep(grp, 'COMMON.DATE', 'today'), 'COMMON.BUDGET', 'low'), 'COMMON.BASIS', 'total');
    expect(() => answerStep(g, 'COMMON.PARTY_SIZE', 2)).toThrow(InvalidAnswerError);
    g = answerStep(g, 'COMMON.PARTY_SIZE', 3);
    expect(g.currentStepId).toBe(TERMINAL_STEP);
  });

  it('finalizeAnswers derives party size and basis', () => {
    expect(finalizeAnswers({ companion: 'solo' })).toMatchObject({ partySize: 1, budgetBasis: 'per_person' });
    expect(finalizeAnswers({ companion: 'partner' }).partySize).toBe(2);
    expect(finalizeAnswers({ companion: 'friend', budgetBasis: 'total' }).budgetBasis).toBe('total');
  });

  it('longest possible path is bounded (documented in DECISIONS D-06)', () => {
    const lens: number[] = [];
    const dfs = (s: QuizState): void => {
      if (s.currentStepId === TERMINAL_STEP) { lens.push(s.visitedStepIds.length); return; }
      const step = getStep(s.currentStepId);
      const vals = step.id === 'COMMON.Q2' ? ['solo', 'family'] : step.id === 'COMMON.DATE' ? ['today', 'date']
        : step.id === 'COMMON.BUDGET' ? ['mid'] : step.id === 'COMMON.Q4' ? ['any', 'home'] : sampleValues(step, s.answers).slice(0, 4);
      for (const v of vals) dfs(answerStep(s, step.id, v));
    };
    dfs(initialState());
    expect(Math.min(...lens)).toBe(8);
    expect(Math.max(...lens)).toBeLessThanOrEqual(16);
    console.info(`path length: min=${Math.min(...lens)} max=${Math.max(...lens)}`);
  });
});

// ---------- state machine (spec §4, §13, §14.4–5) ----------
describe('state machine', () => {
  it('stores each G2 subtype answer and rejects answers for steps not on the path', () => {
    const s = run([['COMMON.Q1', 'high'], ['COMMON.Q2', 'group'], ['COMMON.Q3', 'excitement'], ['COMMON.Q4', 'indoor'],
      ['COMMON.DIRECTION', 'games'], ['BRANCH.GAMES.G1', 'mind'], ['BRANCH.GAMES.G2_MIND', 'quiz']]);
    expect(s.answers.branchAnswers).toEqual({ G1: 'mind', G2_MIND: 'quiz' });
    expect(() => answerStep(s, 'BRANCH.GAMES.G2_DIGITAL', 'vr')).toThrow(InvalidAnswerError);
  });

  it('back from G2_MIND to G1, change to digital: G2_MIND answer is cleared, G2_DIGITAL is shown', () => {
    let s = run([['COMMON.Q1', 'high'], ['COMMON.Q2', 'group'], ['COMMON.Q3', 'excitement'], ['COMMON.Q4', 'indoor'],
      ['COMMON.DIRECTION', 'games'], ['BRANCH.GAMES.G1', 'mind'], ['BRANCH.GAMES.G2_MIND', 'quiz'], ['BRANCH.GAMES.G3', 'friendly']]);
    s = goBack(goBack(goBack(s)));
    expect(s.currentStepId).toBe('BRANCH.GAMES.G1');
    expect(s.answers.branchAnswers?.G1).toBe('mind'); // selection preserved while going back
    s = answerStep(s, 'BRANCH.GAMES.G1', 'digital');
    expect(s.currentStepId).toBe('BRANCH.GAMES.G2_DIGITAL');
    expect(s.answers.branchAnswers).toEqual({ G1: 'digital' });
  });

  it('re-answering with the same value keeps later answers and just moves forward', () => {
    let s = run([['COMMON.Q1', 'high'], ['COMMON.Q2', 'solo'], ['COMMON.Q3', 'relax'], ['COMMON.Q4', 'home'], ['BRANCH.HOME.H1', 'cozy']]);
    s = answerStep(s, 'BRANCH.HOME.H2', 'minimal');
    s = goBack(goBack(s));
    s = answerStep(s, 'BRANCH.HOME.H1', 'cozy');
    expect(s.answers.branchAnswers).toEqual({ H1: 'cozy', H2: 'minimal' });
    expect(s.currentStepId).toBe('BRANCH.HOME.H2');
  });

  it('changing an early answer clears all downstream state including dependent tail answers', () => {
    let s = run([['COMMON.Q1', 'any'], ['COMMON.Q2', 'group'], ['COMMON.Q3', 'relax'], ['COMMON.Q4', 'any'],
      ['COMMON.DIRECTION', 'culture'], ['BRANCH.CULTURE.C1', 'visual'], ['BRANCH.CULTURE.C2', 'watch'],
      ['COMMON.DATE', 'today'], ['COMMON.BUDGET', 'low'], ['COMMON.BASIS', 'total'], ['COMMON.PARTY_SIZE', 6]]);
    expect(s.currentStepId).toBe(TERMINAL_STEP);
    s = answerStep(s, 'COMMON.Q2', 'friend');
    expect(s.answers).toEqual({ socialEnergy: 'any', companion: 'friend' });
    expect(s.currentStepId).toBe('COMMON.Q3');
  });

  it('Q4 change from outside to home removes direction and branch answers', () => {
    let s = run([['COMMON.Q1', 'any'], ['COMMON.Q2', 'solo'], ['COMMON.Q3', 'relax'], ['COMMON.Q4', 'outside'],
      ['COMMON.DIRECTION', 'walks'], ['BRANCH.WALKS.W1', 'scenic']]);
    s = answerStep(s, 'COMMON.Q4', 'home');
    expect(s.answers.direction).toBeUndefined();
    expect(s.answers.branchAnswers).toBeUndefined();
    expect(s.currentStepId).toBe('BRANCH.HOME.H1');
  });

  it('rejects invalid values and unvisited steps; goBack on the first step is a no-op', () => {
    const s0 = initialState();
    expect(() => answerStep(s0, 'COMMON.Q1', 'loud')).toThrow(InvalidAnswerError);
    expect(() => answerStep(s0, 'COMMON.Q2', 'solo')).toThrow(InvalidAnswerError);
    expect(() => answerStep(s0, 'RESULTS', 'x')).toThrow(InvalidAnswerError);
    expect(goBack(s0)).toBe(s0);
  });

  it('state is JSON-serializable and restores; stale version and tampered drafts are rejected', () => {
    const s = run([['COMMON.Q1', 'low'], ['COMMON.Q2', 'solo'], ['COMMON.Q3', 'discovery']]);
    const wire = JSON.parse(JSON.stringify(s));
    const r = restoreState(wire);
    expect(r.ok && r.state).toEqual(s);
    expect(restoreState({ ...wire, schemaVersion: 0 })).toEqual({ ok: false, reason: 'STALE_QUIZ_VERSION' });
    expect(restoreState({ ...wire, answers: { ...wire.answers, direction: 'games' } })).toEqual({ ok: false, reason: 'INVALID_STATE' });
    expect(restoreState({ ...wire, answers: { socialEnergy: 'nope' } }).ok).toBe(false);
    expect(restoreState('garbage').ok).toBe(false);
    expect(restoreState(null).ok).toBe(false);
  });

  it('readAnswer/writeAnswer round-trip for branch and top-level keys', () => {
    const q1 = getStep('COMMON.Q1'); const w1 = getStep('BRANCH.WALKS.W1');
    let a = writeAnswer(w1, writeAnswer(q1, {}, 'high'), 'scenic');
    expect(readAnswer(w1, a)).toBe('scenic');
    a = writeAnswer(w1, a, undefined);
    expect(a).toEqual({ socialEnergy: 'high' });
  });
});

// ---------- server-side validation (POST /api/quiz/complete) ----------
describe('validateComplete', () => {
  const good = finishWithFirst(run([['COMMON.Q1', 'high'], ['COMMON.Q2', 'solo'], ['COMMON.Q3', 'relax'], ['COMMON.Q4', 'home']])).answers;

  it('accepts a complete consistent answer set', () => {
    expect(validateComplete(good).ok).toBe(true);
  });
  it('rejects incomplete, invalid, stray and malformed input', () => {
    const code = (x: unknown) => { const r = validateComplete(x); return r.ok ? 'OK' : r.issues[0]!.code; };
    expect(code({})).toBe('INCOMPLETE');
    expect(code({ ...good, mood: 'angry' })).toBe('INVALID_ANSWER');
    expect(code({ ...good, direction: 'games' })).toBe('STRAY_ANSWER');
    expect(code({ ...good, branchAnswers: { ...good.branchAnswers, G1: 'mind' } })).toBe('STRAY_ANSWER');
    expect(code({ ...good, isAdmin: true })).toBe('INVALID_ANSWER');
    expect(code('not json object')).toBe('INVALID_ANSWER');
    expect(code(null)).toBe('INVALID_ANSWER');
  });
  it('rejects an impossible calendar date', () => {
    const a = finishWithFirst(run([['COMMON.Q1', 'high'], ['COMMON.Q2', 'solo'], ['COMMON.Q3', 'relax'], ['COMMON.Q4', 'home'],
      ['BRANCH.HOME.H1', 'cozy'], ['BRANCH.HOME.H2', 'minimal'], ['COMMON.DATE', 'date']])).answers;
    expect(validateComplete(a).ok).toBe(true);
    expect(validateComplete({ ...a, targetDate: '2026-02-31' }).ok).toBe(false);
  });
});
