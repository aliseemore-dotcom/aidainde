import Link from 'next/link';
import { LogoLink } from '@/components/ui/Logo';
import { Art, type Illustration } from '@/components/ui/Art';
import { ArrowUpRight, ICON_STROKE } from '@/components/ui/icons';

const ENTRIES: { href: string; title: string; meta: string; art: Illustration; warm?: boolean; soon?: boolean }[] = [
  { href: '/quiz', title: 'Подбери мне досуг', meta: 'Несколько вопросов — и готова подборка', art: 'kul-sharif' },
  { href: '/explore', title: 'Хочу выбрать сам', meta: 'Каталог мест, событий и идей', art: 'echpochmak', warm: true },
  { href: '/date', title: 'У меня сегодня свидание', meta: 'Скоро запустим', art: 'tulip', warm: true, soon: true },
];

export default function HomePage() {
  return (
    <div className="page">
      <header className="pagehead">
        <LogoLink />
      </header>
      <div className="stack">
        <div>
          <p className="t-greet">Сәлам!</p>
          <h1 className="t-h1">Хм, чем бы заняться в Казани?</h1>
          <p className="t-body" style={{ marginTop: 'var(--space-3)', color: 'var(--ink-muted)' }}>
            Подскажем, куда пойти и чем заняться: ответь на несколько вопросов или выбери сам в каталоге мест и событий.
          </p>
        </div>
        <ul className="entries" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {ENTRIES.map((e) => (
            <li key={e.href}>
              <Link href={e.href} className="k-card k-card--wide">
                <div className={`k-card__art${e.warm ? ' k-card__art--warm' : ''}`}><Art name={e.art} /></div>
                <div className="k-card__body">
                  <span className="k-card__title">{e.title}</span>
                  <span className="k-card__meta">{e.meta}</span>
                </div>
                <div className="k-entry__foot">
                  {e.soon ? <span className="k-badge">Скоро</span> : <span />}
                  <span className="k-btn__circle" aria-hidden="true"><ArrowUpRight size={20} strokeWidth={ICON_STROKE} /></span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
        <p className="t-meta">Подборка собирается из проверенных записей каталога по понятным правилам — без выдуманных мест и цен.</p>
      </div>
    </div>
  );
}
