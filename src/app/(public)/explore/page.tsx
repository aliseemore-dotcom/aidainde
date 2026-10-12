import type { Metadata } from 'next';
import Link from 'next/link';
import { getDb } from '@/db/client';
import { listCatalog } from '@/features/catalog/queries';
import { catalogQuery } from '@/features/catalog/validators';
import { ResultCard } from '@/components/catalog/ResultCard';
import { EmptyState } from '@/components/catalog/EmptyState';
import { ErrorState } from '@/components/catalog/ErrorState';
import { LogoLink } from '@/components/ui/Logo';
import { ButtonLink } from '@/components/ui/Button';
import { Search, ICON_STROKE } from '@/components/ui/icons';
import { allowDemoContent } from '@/lib/env';
import { safe } from '@/lib/db-safe';
import { DIRECTION_TAGS, tagLabel } from '@/features/recommend/tag-registry';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Каталог', description: 'Места, события и идеи для досуга в Казани.' };

const TYPES = [{ v: 'event', l: 'События' }, { v: 'place', l: 'Места' }, { v: 'activity', l: 'Идеи на дом' }] as const;
const PRICES = [{ v: '', l: 'Любая цена' }, { v: '0', l: 'Бесплатно' }, { v: '1000', l: 'До 1 000 ₽' }, { v: '3000', l: 'До 3 000 ₽' }, { v: '5000', l: 'До 5 000 ₽' }];

function href(params: Record<string, string | undefined>) {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) sp.set(k, v);
  const s = sp.toString();
  return s ? `/explore?${s}` : '/explore';
}

export default async function ExplorePage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const raw = await searchParams;
  const parsed = catalogQuery.safeParse({ type: 'event', ...Object.fromEntries(Object.entries(raw).filter(([, v]) => v !== '' && v !== undefined)) });
  // мусор в адресе не ломает страницу: откатываемся к значениям по умолчанию
  const q = parsed.success ? parsed.data : catalogQuery.parse({ type: 'event' });
  const base = { type: q.type, category: q.category, q: q.q, priceMax: q.priceMax?.toString(), date: q.date };

  const res = await safe(async () => listCatalog(await getDb(), q, { allowDemo: allowDemoContent(), now: new Date() }));
  const pages = res.ok ? Math.max(1, Math.ceil(res.value.total / q.pageSize)) : 1;

  return (
    <div className="page">
      <header className="pagehead"><LogoLink /></header>
      <div className="stack">
        <h1 className="t-h1">Выбери сам</h1>

        <nav aria-label="Тип записи"><div className="chips">
          {TYPES.map((t) => (
            <Link key={t.v} className="k-chip" href={href({ type: t.v })} aria-current={q.type === t.v ? 'true' : undefined}>{t.l}</Link>
          ))}
        </div></nav>

        <form className="searchform" action="/explore" method="get" role="search">
          <input type="hidden" name="type" value={q.type} />
          {q.category && <input type="hidden" name="category" value={q.category} />}
          <div className="k-search">
            <Search size={22} strokeWidth={ICON_STROKE} aria-hidden="true" />
            <label className="k-sr" htmlFor="q">Поиск по каталогу</label>
            <input id="q" type="search" name="q" defaultValue={q.q ?? ''} placeholder="Спектакль, концерт, место…" maxLength={80} />
            <button type="submit" aria-label="Найти"><Search size={20} strokeWidth={ICON_STROKE} aria-hidden="true" /></button>
          </div>
          <div className="filters-row">
            <div className="field"><label htmlFor="priceMax" className="t-meta">Цена</label>
              <select id="priceMax" name="priceMax" defaultValue={q.priceMax?.toString() ?? ''}>
                {PRICES.map((p) => <option key={p.v} value={p.v}>{p.l}</option>)}
              </select></div>
            {q.type === 'event' && (
              <div className="field"><label htmlFor="date" className="t-meta">Дата</label>
                <input id="date" type="date" name="date" defaultValue={q.date ?? ''} /></div>
            )}
            <button type="submit" className="k-btn k-btn--sunken">Применить</button>
          </div>
        </form>

        {q.type !== 'activity' && (
          <nav aria-label="Категория"><div className="chips chips--scroll">
            <Link className="k-chip" href={href({ ...base, category: undefined })} aria-current={!q.category ? 'true' : undefined}>Все</Link>
            {DIRECTION_TAGS.filter((t) => t !== 'home').map((t) => (
              <Link key={t} className="k-chip" href={href({ ...base, category: t })} aria-current={q.category === t ? 'true' : undefined}>{tagLabel(t)}</Link>
            ))}
          </div></nav>
        )}

        {!res.ok ? <ErrorState retryHref={href(base)} /> : res.value.items.length === 0 ? (
          <EmptyState title="Ничего не нашли" text="В каталоге пока нет записей под эти фильтры. Мы показываем только проверенное и ничего не выдумываем.">
            <ButtonLink href="/explore" variant="sunken">Сбросить фильтры</ButtonLink>
            <ButtonLink href="/quiz" arrow>Подобрать досуг</ButtonLink>
          </EmptyState>
        ) : (
          <>
            <ul className="grid grid--wide" aria-label="Каталог">
              {res.value.items.map((i) => (
                <li key={i.id}>
                  <ResultCard card={{ type: i.type, slug: i.slug, title: i.title, tags: i.tags, priceMin: i.priceMin, priceMax: i.priceMax, priceUnit: i.priceUnit, startsAt: i.startsAt, status: i.status, isDemo: i.isDemo, district: i.district }} />
                </li>
              ))}
            </ul>
            {pages > 1 && (
              <nav className="pager" aria-label="Страницы">
                {q.page > 1 ? <Link className="k-btn k-btn--secondary" href={href({ ...base, page: String(q.page - 1) })} rel="prev">Назад</Link> : <span />}
                <span className="t-meta">Страница {q.page} из {pages}</span>
                {q.page < pages ? <Link className="k-btn k-btn--secondary" href={href({ ...base, page: String(q.page + 1) })} rel="next">Дальше</Link> : <span />}
              </nav>
            )}
          </>
        )}
      </div>
    </div>
  );
}
