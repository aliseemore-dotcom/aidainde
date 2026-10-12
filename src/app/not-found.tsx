import { LogoLink } from '@/components/ui/Logo';
import { ButtonLink } from '@/components/ui/Button';
import { Art } from '@/components/ui/Art';

export default function NotFound() {
  return (
    <div className="page">
      <header className="pagehead"><LogoLink /></header>
      <div className="hero-soon">
        <Art name="notes" />
        <h1 className="t-h1">Такой страницы нет</h1>
        <p className="t-body">Возможно, ссылка устарела или запись снята с публикации.</p>
        <ButtonLink href="/">На главную</ButtonLink>
      </div>
    </div>
  );
}
