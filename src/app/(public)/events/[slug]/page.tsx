import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { loadDetail } from '@/lib/preview';
import { DetailShell, Facts, SourceBlock, TagList, ageText } from '@/components/catalog/DetailParts';
import { ExternalLink, MapLink } from '@/components/catalog/MapLink';
import { PlainText } from '@/components/catalog/PlainText';
import { ErrorState } from '@/components/catalog/ErrorState';
import { formatPrice, directionLabel } from '@/features/catalog/presentation';
import { formatEventMeta, formatLongDate } from '@/lib/date-kazan';
import type { events } from '@/db/schema';

export const dynamic = 'force-dynamic';
type Ev = typeof events.$inferSelect;
const STATUS = { cancelled: 'Мероприятие отменено', sold_out: 'Билеты закончились' } as const;

const load = (slug: string, preview: boolean) => loadDetail('event', slug, preview);

export async function generateMetadata({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ preview?: string }> }): Promise<Metadata> {
  const preview = (await searchParams).preview === '1';
  const r = await load((await params).slug, preview);
  if (!r.ok || !r.value.detail) return { title: 'Событие', robots: { index: false } };
  const e = r.value.detail.record as Ev;
  const description = e.description.slice(0, 160);
  return { title: e.title, description, openGraph: { title: e.title, description, type: 'article' }, robots: preview || r.value.detail.isDemo ? { index: false } : undefined };
}

export default async function EventPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ preview?: string }> }) {
  const { slug } = await params;
  const r = await load(slug, (await searchParams).preview === '1');
  if (!r.ok) return <div className="page"><ErrorState retryHref={`/events/${slug}`} /></div>;
  if (!r.value.detail) notFound();
  const d = r.value.detail;
  const e = d.record as Ev;
  const unavailable = STATUS[e.status as keyof typeof STATUS];
  const sessions = [{ startsAt: e.startsAt, endsAt: e.endsAt, status: e.status === 'published' ? 'published' : e.status }, ...d.occurrences];
  return (
    <DetailShell d={d} previewing={r.value.previewing} backHref="/explore?type=event" backLabel="В каталог">
      <div className="stack stack--tight">
        <p className="t-meta">{formatLongDate(e.startsAt)} · {formatEventMeta(e.startsAt)} · {directionLabel(d.tags) ?? 'Событие'}</p>
        <h1 className="t-h1">{e.title}</h1>
        {unavailable && <p><span className="k-tag k-tag--danger">{unavailable}</span></p>}
      </div>
      <PlainText text={e.description} />
      <Facts items={[
        { label: 'Стоимость', value: formatPrice(e.priceMin, e.priceMax, e.priceUnit) },
        { label: 'Возраст', value: ageText(e.ageMin, e.ageMax) },
        { label: 'Место', value: d.place ? <Link href={`/places/${d.place.slug}`}>{d.place.title}</Link> : null, wide: true },
        { label: 'Адрес', value: d.place?.address, wide: true },
      ]} />
      {sessions.length > 1 && (
        <section className="section" aria-labelledby="sessions">
          <h2 id="sessions" className="t-h2">Сеансы</h2>
          <ul className="occ">
            {sessions.map((s) => (
              <li key={s.startsAt.toISOString()}>
                <span>{formatLongDate(s.startsAt)}, {formatEventMeta(s.startsAt)}</span>
                {s.status !== 'published' && <span className="k-tag k-tag--danger">{s.status === 'sold_out' ? 'Билеты закончились' : 'Отменён'}</span>}
              </li>
            ))}
          </ul>
        </section>
      )}
      <div className="actions">
        {unavailable ? (
          <button type="button" className="k-btn k-btn--primary" disabled>{unavailable}</button>
        ) : e.ticketsUrl ? <ExternalLink href={e.ticketsUrl} primary>Билеты у организатора</ExternalLink> : null}
        {d.place && <MapLink address={d.place.address} lat={d.place.lat} lng={d.place.lng} />}
      </div>
      <TagList tags={d.tags} />
      <SourceBlock sourceUrl={e.sourceUrl} verifiedAt={e.verifiedAt} />
      <p className="disclaimer">Мы не продаём билеты и не обещаем свободных мест: наличие проверяйте у организатора.</p>
    </DetailShell>
  );
}
