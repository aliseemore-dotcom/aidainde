import type { Metadata } from 'next';
import { LogoLink } from '@/components/ui/Logo';
import { Art } from '@/components/ui/Art';
import { ButtonLink } from '@/components/ui/Button';

export const metadata: Metadata = { title: 'Свидание — скоро' };

/** Заглушка. Будущий DateQuiz — отдельный модуль со своей схемой (quizType=date), общего состояния с /quiz нет. */
export default function DatePage() {
  return (
    <div className="page">
      <header className="pagehead"><LogoLink /></header>
      <div className="hero-soon">
        <Art name="tulip" />
        <h1 className="t-h1">Скоро запустим</h1>
        <p className="t-body">Отдельный подбор для свиданий уже в работе: свои вопросы и свои идеи. Пока можно подобрать досуг обычным способом или выбрать самому.</p>
        <div className="actions" style={{ justifyContent: 'center' }}>
          <ButtonLink href="/quiz">Подобрать досуг</ButtonLink>
          <ButtonLink href="/explore" variant="secondary">Открыть каталог</ButtonLink>
        </div>
      </div>
    </div>
  );
}
