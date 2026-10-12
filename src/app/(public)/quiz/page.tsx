import type { Metadata } from 'next';
import { QuizShell } from '@/components/quiz/QuizShell';

export const metadata: Metadata = { title: 'Подобрать досуг' };

export default function QuizPage() {
  return <QuizShell />;
}
