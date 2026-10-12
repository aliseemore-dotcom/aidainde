import Link from 'next/link';
import { count, eq } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { activities, events, places } from '@/db/schema';
import { guardAdminPage } from '@/lib/auth';
import { loadAttention } from '@/features/catalog/attention';
import { readMetrics } from '@/features/results/metrics';

export const dynamic = 'force-dynamic';

export default async function AdminHome() {
  await guardAdminPage();
  const db = await getDb();
  const n = async (t: typeof places | typeof events | typeof activities, status?: 'published' | 'draft') =>
    Number(((await db.select({ n: count() }).from(t).where(status ? eq(t.status, status) : undefined)) as [{ n: number }])[0].n);
  const rows = await Promise.all([['Места', 'places', places], ['События', 'events', events], ['Идеи на дом', 'activities', activities]].map(async ([l, s, t]) => ({
    label: l as string, path: s as string, all: await n(t as typeof places), pub: await n(t as typeof places, 'published'), draft: await n(t as typeof places, 'draft'),
  })));
  const now = new Date();
  const [attention, metrics] = await Promise.all([loadAttention(db, now), readMetrics(db, now)]);
  const m = (k: string) => metrics.totals[k] ?? 0;
  const dirs = Object.entries(metrics.totals).filter(([k]) => k.startsWith('direction:')).sort((a, b) => b[1] - a[1]);
  const SECTION = { event: 'events', place: 'places' } as const;
  return (
    <>
      <h1 className="t-h1">Каталог</h1>
      <ul className="grid grid--wide">
        {rows.map((r) => (
          <li key={r.path}><Link href={`/admin/${r.path}`} className="k-card k-card--wide">
            <div className="k-card__body"><span className="k-card__title">{r.label}</span>
              <span className="k-card__meta">Всего {r.all} · опубликовано {r.pub} · черновиков {r.draft}</span></div></Link></li>
        ))}
      </ul>
      <section className="section" aria-labelledby="attn">
        <h2 id="attn" className="t-h2">Требует внимания{attention.length ? ` (${attention.length})` : ''}</h2>
        {attention.length === 0 ? <p className="t-meta">Всё свежее: перепроверять нечего.</p> : (
          <ul className="occ">
            {attention.map((a) => (
              <li key={`${a.type}-${a.id}`}><Link href={`/admin/${SECTION[a.type]}/${a.id}`}>{a.title}</Link><span className="t-meta">{a.detail}</span></li>
            ))}
          </ul>
        )}
      </section>
      <section className="section" aria-labelledby="stats">
        <h2 id="stats" className="t-h2">За {metrics.days} дней</h2>
        <p className="t-meta">Без персональных данных: только счётчики.</p>
        <dl className="facts">
          <div><dt>Пройдено тестов</dt><dd>{m('quiz_completed')}</dd></div>
          <div><dt>Подборка пустая</dt><dd>{m('results_empty')}</dd></div>
          {dirs.slice(0, 4).map(([k, n]) => <div key={k}><dt>{k.replace('direction:', 'Направление: ')}</dt><dd>{n}</dd></div>)}
        </dl>
      </section>
      <p className="disclaimer">Событие попадает в подборку только с датой проверки и ссылкой на первоисточник.</p>
    </>
  );
}
