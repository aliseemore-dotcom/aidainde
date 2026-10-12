import type { Metadata } from 'next';
import { Suspense } from 'react';
import { QuizShell } from '@/components/quiz/QuizShell';

export const metadata: Metadata = { title: 'Подобрать досуг' };

export default function QuizPage() {
  return (
    <Suspense fallback={<div className="page page--quiz" aria-busy="true"><p className="t-meta" role="status">Загружаем…</p></div>}>
      <QuizShell />
    </Suspense>
  );
}
