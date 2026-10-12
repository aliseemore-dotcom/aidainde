'use client';

import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { answerStep, goBack, goToStep, initialState, restoreState, InvalidAnswerError, type QuizState } from '@/features/quiz/state';
import { walkPath } from '@/features/quiz/graph';
import { QUIZ_SCHEMA_VERSION, START_STEP } from '@/features/quiz/types';

const KEY = 'aydainde.quiz.draft';
const TTL_MS = 24 * 60 * 60 * 1000;

type Action =
  | { type: 'answer'; stepId: string; value: unknown }
  | { type: 'back' }
  | { type: 'goto'; index: number }
  | { type: 'reset' }
  | { type: 'restore'; state: QuizState };

function reducer(s: QuizState, a: Action): QuizState {
  try {
    switch (a.type) {
      case 'answer': return answerStep(s, a.stepId, a.value);
      case 'back': return goBack(s);
      case 'goto': return goToStep(s, a.index);
      case 'reset': return initialState();
      case 'restore': return a.state;
    }
  } catch (e) {
    if (e instanceof InvalidAnswerError) return s; // невалидный ввод игнорируем; UI не даёт его отправить
    throw e;
  }
}

export type DraftNotice = null | 'stale' | 'invalid';

/** Состояние теста + черновик в localStorage (TTL 24 ч) + синхронизация с кнопками браузера. */
export interface EditRequest { token: string; step?: string }

/** `edit` — вход из результатов: подгружаем прежние ответы по токену и открываем нужный шаг. */
export function useQuiz(edit?: EditRequest | null) {
  const [state, dispatch] = useReducer(reducer, undefined, initialState);
  const [ready, setReady] = useState(false);
  const [notice, setNotice] = useState<DraftNotice>(null);
  const fromPop = useRef(false);
  const lastIdx = useRef(0);

  // восстановление черновика (после гидрации, чтобы не ломать SSR-разметку)
  useEffect(() => {
    let cancelled = false;
    const finish = (restoredIdx: number, clearUrl: boolean) => {
      if (cancelled) return;
      history.replaceState({ ...history.state, quizIndex: restoredIdx }, '', clearUrl ? '/quiz' : undefined);
      lastIdx.current = restoredIdx; // восстановленный шаг не создаёт лишнюю запись истории
      setReady(true);
    };

    if (edit?.token) {
      fetch(`/api/results/${encodeURIComponent(edit.token)}`)
        .then(async (res) => {
          if (!res.ok) throw new Error('gone');
          const { quizAnswers } = await res.json();
          const r = restoreState({ schemaVersion: QUIZ_SCHEMA_VERSION, quizType: 'main', currentStepId: START_STEP, answers: quizAnswers, visitedStepIds: [] });
          if (!r.ok) throw new Error('stale');
          const path = walkPath(r.state.answers).path;
          const idx = Math.max(0, path.indexOf(edit.step ?? ''));
          const st = goToStep(r.state, idx);
          if (cancelled) return;
          dispatch({ type: 'restore', state: st });
          finish(st.visitedStepIds.length, true);
        })
        .catch(() => { if (!cancelled) { setNotice('invalid'); finish(0, true); } });
      return () => { cancelled = true; };
    }

    let restoredIdx = 0;
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const { savedAt, state: saved } = JSON.parse(raw) as { savedAt: number; state: unknown };
        if (Date.now() - savedAt > TTL_MS) {
          localStorage.removeItem(KEY);
        } else {
          const r = restoreState(saved);
          if (r.ok) { dispatch({ type: 'restore', state: r.state }); restoredIdx = r.state.visitedStepIds.length; }
          // eslint-disable-next-line react-hooks/set-state-in-effect -- синхронизация с внешним хранилищем (localStorage) при монтировании
          else { setNotice(r.reason === 'STALE_QUIZ_VERSION' ? 'stale' : 'invalid'); localStorage.removeItem(KEY); }
        }
      }
    } catch { /* storage недоступен — работаем без черновика */ }
    finish(restoredIdx, false);
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!ready) return;
    try { localStorage.setItem(KEY, JSON.stringify({ savedAt: Date.now(), state })); } catch { /* ignore */ }
  }, [state, ready]);

  // «Назад/вперёд» браузера двигают по шагам теста
  useEffect(() => {
    const onPop = (e: PopStateEvent) => {
      const i = (e.state as { quizIndex?: number } | null)?.quizIndex ?? 0;
      fromPop.current = true;
      dispatch({ type: 'goto', index: i });
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  // каждый новый шаг — запись в истории браузера (URL не меняется, ответы в адрес не попадают).
  // history.state принадлежит роутеру Next.js: свои поля только добавляем, иначе при «назад» страница перезагрузится.
  const idx = state.visitedStepIds.length;
  useEffect(() => {
    if (!ready) return;
    if (fromPop.current) { fromPop.current = false; lastIdx.current = idx; return; }
    if (idx > lastIdx.current) history.pushState({ ...history.state, quizIndex: idx }, '');
    lastIdx.current = idx;
  }, [idx, ready]);

  const answer = useCallback((stepId: string, value: unknown) => dispatch({ type: 'answer', stepId, value }), []);
  const back = useCallback(() => {
    if (idx > 0 && history.state?.quizIndex === idx) history.back(); else dispatch({ type: 'back' });
  }, [idx]);
  const reset = useCallback(() => {
    try { localStorage.removeItem(KEY); } catch { /* ignore */ }
    setNotice(null);
    dispatch({ type: 'reset' });
    history.replaceState({ ...history.state, quizIndex: 0 }, '');
    lastIdx.current = 0;
  }, []);
  const clearDraft = useCallback(() => { try { localStorage.removeItem(KEY); } catch { /* ignore */ } }, []);

  return { state, ready, notice, dismissNotice: () => setNotice(null), answer, back, reset, clearDraft };
}
