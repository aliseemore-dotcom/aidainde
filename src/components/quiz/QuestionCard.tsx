'use client';

import { useEffect, useRef, type ReactNode } from 'react';

/** Заголовок вопроса получает фокус при смене шага (скринридеры и клавиатура). */
export function QuestionCard({ stepId, title, children }: { stepId: string; title: string; children: ReactNode }) {
  const ref = useRef<HTMLHeadingElement>(null);
  useEffect(() => { ref.current?.focus({ preventScroll: false }); }, [stepId]);
  return (
    <section className="quiz-body" aria-labelledby="quiz-title">
      <h1 id="quiz-title" ref={ref} tabIndex={-1} className="t-h1 quiz-title">{title}</h1>
      {children}
    </section>
  );
}
