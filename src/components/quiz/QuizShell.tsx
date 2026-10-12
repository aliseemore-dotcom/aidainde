'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { useQuiz } from './useQuiz';
import { QuestionCard } from './QuestionCard';
import { Progress } from './Progress';
import { SingleStep, DirectionStep, MultiStep, NumberStep, DateStep } from './Steps';
import { IconButton } from '@/components/ui/IconButton';
import { Button } from '@/components/ui/Button';
import { LogoLink } from '@/components/ui/Logo';
import { Art } from '@/components/ui/Art';
import { ArrowLeft, ICON_STROKE } from '@/components/ui/icons';
import { getStep } from '@/features/quiz/config';
import { estimateRemaining } from '@/features/quiz/progress';
import { finalizeAnswers } from '@/features/quiz/graph';
import { TERMINAL_STEP } from '@/features/quiz/types';

type Submit = { status: 'idle' } | { status: 'loading' } | { status: 'error'; message: string };

export function QuizShell() {
  const router = useRouter();
  const quiz = useQuiz();
  const { state } = quiz;
  const [submit, setSubmit] = useState<Submit>({ status: 'idle' });
  const inflight = useRef(false);

  const atEnd = state.currentStepId === TERMINAL_STEP;

  async function complete() {
    if (inflight.current) return;
    inflight.current = true;
    setSubmit({ status: 'loading' });
    try {
      const res = await fetch('/api/quiz/complete', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ schemaVersion: state.schemaVersion, quizType: state.quizType, answers: state.answers }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        const code = body?.error?.code as string | undefined;
        const message = code === 'STALE_QUIZ_VERSION' ? 'Тест обновился. Давай начнём заново.'
          : code === 'RATE_LIMITED' ? 'Слишком много запросов. Подожди минуту и повтори.'
          : 'Не получилось собрать подборку. Проверь соединение и повтори.';
        setSubmit({ status: 'error', message });
        return;
      }
      quiz.clearDraft();
      router.push(`/results?session=${encodeURIComponent(body.sessionToken)}`);
    } catch {
      setSubmit({ status: 'error', message: 'Нет соединения. Проверь интернет и повтори.' });
    } finally {
      inflight.current = false;
    }
  }

  useEffect(() => {
    if (quiz.ready && atEnd && submit.status === 'idle') void complete();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quiz.ready, atEnd]);

  if (!quiz.ready) {
    return <div className="page page--quiz" aria-busy="true"><p className="t-meta" role="status">Загружаем…</p></div>;
  }

  if (atEnd) {
    return (
      <div className="page page--quiz">
        <div className="quiz-top"><LogoLink /></div>
        {submit.status === 'error' ? (
          <div className="k-notice k-notice--danger" role="alert">
            <p className="t-body">{submit.message}</p>
            <div className="actions">
              <Button onClick={() => { setSubmit({ status: 'idle' }); void complete(); }}>Повторить</Button>
              <Button variant="sunken" onClick={quiz.reset}>Начать заново</Button>
            </div>
          </div>
        ) : (
          <div className="hero-soon" role="status" aria-live="polite">
            <Art name="kul-sharif" />
            <h1 className="t-h2">Собираем подборку…</h1>
          </div>
        )}
      </div>
    );
  }

  const step = getStep(state.currentStepId);
  const title = step.titleResolver ? step.titleResolver(state.answers) : step.title;
  const answer = (v: unknown) => quiz.answer(step.id, v);
  const remaining = estimateRemaining(step.id, finalizeAnswers(state.answers));
  const props = { step, answers: state.answers, onAnswer: answer };

  return (
    <div className="page page--quiz">
      <div className="quiz-top">
        {state.visitedStepIds.length > 0 ? (
          <IconButton label="Назад" onClick={quiz.back}><ArrowLeft size={22} strokeWidth={ICON_STROKE} aria-hidden="true" /></IconButton>
        ) : <LogoLink />}
        <div className="quiz-top__hint"><Progress remaining={remaining} answered={state.visitedStepIds.length} /></div>
      </div>

      {quiz.notice && (
        <div className="k-notice" role="status" style={{ marginBottom: 'var(--space-5)' }}>
          <p className="t-body">{quiz.notice === 'stale' ? 'Тест с тех пор обновился, поэтому прежние ответы не подошли. Начинаем заново.' : 'Не удалось восстановить прежние ответы. Начинаем заново.'}</p>
          <div className="actions"><Button variant="sunken" onClick={quiz.dismissNotice}>Понятно</Button></div>
        </div>
      )}

      <QuestionCard stepId={step.id} title={title}>
        {step.id === 'COMMON.DIRECTION' ? <DirectionStep key={step.id} {...props} />
          : step.kind === 'multi' ? <MultiStep key={step.id} {...props} />
          : step.kind === 'number' ? <NumberStep key={step.id} {...props} />
          : step.kind === 'date' ? <DateStep key={step.id} {...props} />
          : <SingleStep key={step.id} {...props} />}
      </QuestionCard>

      {state.visitedStepIds.length > 0 && (
        <div style={{ marginTop: 'var(--space-6)' }}>
          <button type="button" className="k-linkbtn" onClick={quiz.reset}>Начать заново</button>
        </div>
      )}
    </div>
  );
}
