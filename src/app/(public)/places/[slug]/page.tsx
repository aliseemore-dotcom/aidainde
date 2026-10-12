import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { loadDetail } from '@/lib/preview';
import { DetailShell, Facts, SourceBlock, TagList, ageText, groupText } from '@/components/catalog/DetailParts';
import { ExternalLink, MapLink } from '@/components/catalog/MapLink';
import { PlainText } from '@/components/catalog/PlainText';
import { ErrorState } from '@/components/catalog/ErrorState';
import { formatPrice, directionLabel } from '@/features/catalog/presentation';
import type { places } from '@/db/schema';

export const dynamic = 'force-dynamic';
type Place = typeof places.$inferSelect;
const SETTING = { indoor: 'В помещении', outdoor: 'На улице', both: 'В помещении и на улице', unknown: null } as const;

const load = (slug: string, preview: boolean) => loadDetail('place', slug, preview);

export async function generateMetadata({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ preview?: string }> }): Promise<Metadata> {
  const preview = (await searchParams).preview === '1';
  const r = await load((await params).slug, preview);
  if (!r.ok || !r.value.detail) return { title: 'Место', robots: { index: false } };
  const p = r.value.detail.record as Place;
  const description = p.description.slice(0, 160);
  return { title: p.title, description, openGraph: { title: p.title, description, type: 'article' }, robots: preview || r.value.detail.isDemo ? { index: false } : undefined };
}

export default async function PlacePage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ preview?: string }> }) {
  const { slug } = await params;
  const r = await load(slug, (await searchParams).preview === '1');
  if (!r.ok) return <div className="page"><ErrorState retryHref={`/places/${slug}`} /></div>;
  if (!r.value.detail) notFound();
  const d = r.value.detail;
  const p = d.record as Place;
  const hours = p.openingHoursJson ? Object.entries(p.openingHoursJson).map(([k, v]) => `${k}: ${v}`).join('; ') : null;
  return (
    <DetailShell d={d} previewing={r.value.previewing} backHref="/explore?type=place" backLabel="В каталог">
      <div className="stack stack--tight">
        <p className="t-meta">Место · {directionLabel(d.tags) ?? 'Досуг'}</p>
        <h1 className="t-h1">{p.title}</h1>
      </div>
      <PlainText text={p.description} />
      <Facts items={[
        { label: 'Адрес', value: p.address, wide: true },
        { label: 'Район', value: p.district },
        { label: 'Стоимость', value: formatPrice(p.priceMin, p.priceMax, p.priceUnit) },
        { label: 'Возраст', value: ageText(p.ageMin, p.ageMax) },
        { label: 'Компания', value: groupText(p.minParticipants, p.maxParticipants) },
        { label: 'Где', value: SETTING[p.indoorOutdoor] },
        { label: 'Часы работы', value: hours ?? 'Проверьте часы работы у организатора', wide: true },
      ]} />
      <div className="actions">
        <MapLink address={p.address} lat={p.lat} lng={p.lng} />
        {p.bookingUrl && <ExternalLink href={p.bookingUrl} primary>Записаться у организатора</ExternalLink>}
        {p.websiteUrl && <ExternalLink href={p.websiteUrl}>Сайт</ExternalLink>}
      </div>
      <TagList tags={d.tags} />
      <SourceBlock sourceUrl={p.sourceUrl} verifiedAt={p.verifiedAt} />
    </DetailShell>
  );
}
