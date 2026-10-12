import Link from 'next/link';
import { count, eq } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { activities, events, places } from '@/db/schema';

export const dynamic = 'force-dynamic';

export default async function AdminHome() {
  const db = await getDb();
  const n = async (t: typeof places | typeof events | typeof activities, status?: 'published' | 'draft') =>
    Number(((await db.select({ n: count() }).from(t).where(status ? eq(t.status, status) : undefined)) as [{ n: number }])[0].n);
  const rows = await Promise.all([['Места', 'places', places], ['События', 'events', events], ['Идеи на дом', 'activities', activities]].map(async ([l, s, t]) => ({
    label: l as string, path: s as string, all: await n(t as typeof places), pub: await n(t as typeof places, 'published'), draft: await n(t as typeof places, 'draft'),
  })));
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
      <p className="disclaimer">Событие попадает в подборку только с датой проверки и ссылкой на первоисточник.</p>
    </>
  );
}
