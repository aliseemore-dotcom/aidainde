import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { loadDetail } from '@/lib/preview';
import { DetailShell, Facts, SourceBlock, TagList, ageText, groupText } from '@/components/catalog/DetailParts';
import { PlainText } from '@/components/catalog/PlainText';
import { ErrorState } from '@/components/catalog/ErrorState';
import { formatPrice } from '@/features/catalog/presentation';
import type { activities } from '@/db/schema';

export const dynamic = 'force-dynamic';
type Act = typeof activities.$inferSelect;

const load = (slug: string, preview: boolean) => loadDetail('activity', slug, preview);

export async function generateMetadata({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ preview?: string }> }): Promise<Metadata> {
  const preview = (await searchParams).preview === '1';
  const r = await load((await params).slug, preview);
  if (!r.ok || !r.value.detail) return { title: 'Идея на дом', robots: { index: false } };
  const a = r.value.detail.record as Act;
  const description = a.description.slice(0, 160);
  return { title: a.title, description, openGraph: { title: a.title, description, type: 'article' }, robots: preview || r.value.detail.isDemo ? { index: false } : undefined };
}

export default async function ActivityPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ preview?: string }> }) {
  const { slug } = await params;
  const r = await load(slug, (await searchParams).preview === '1');
  if (!r.ok) return <div className="page"><ErrorState retryHref={`/activities/${slug}`} /></div>;
  if (!r.value.detail) notFound();
  const d = r.value.detail;
  const a = d.record as Act;
  const duration = a.durationMinutes ? (a.durationMinutes >= 60 ? `${Math.floor(a.durationMinutes / 60)} ч${a.durationMinutes % 60 ? ` ${a.durationMinutes % 60} мин` : ''}` : `${a.durationMinutes} мин`) : null;
  return (
    <DetailShell d={d} previewing={r.value.previewing} backHref="/explore?type=activity" backLabel="В каталог">
      <div className="stack stack--tight">
        <p className="t-meta">Идея на дом</p>
        <h1 className="t-h1">{a.title}</h1>
      </div>
      <PlainText text={a.description} />
      <Facts items={[
        { label: 'Примерная стоимость', value: formatPrice(a.costMin, a.costMax, 'total') },
        { label: 'Длительность', value: duration },
        { label: 'Компания', value: groupText(a.minParticipants, a.maxParticipants) },
        { label: 'Возраст', value: ageText(a.ageMin, a.ageMax) },
      ]} />
      {a.requiredMaterialsJson && a.requiredMaterialsJson.length > 0 && (
        <section className="section" aria-labelledby="materials">
          <h2 id="materials" className="t-h2">Что понадобится</h2>
          <ul className="prose">{a.requiredMaterialsJson.map((m) => <li key={m} className="t-body">{m}</li>)}</ul>
        </section>
      )}
      {a.stepsRichText && (
        <section className="section" aria-labelledby="steps">
          <h2 id="steps" className="t-h2">Как это сделать</h2>
          <PlainText text={a.stepsRichText} />
        </section>
      )}
      <TagList tags={d.tags} />
      {a.sourceUrl ? <SourceBlock sourceUrl={a.sourceUrl} /> : <p className="disclaimer">Это идея для самостоятельного вечера дома: адреса, бронирования и даты нет.</p>}
    </DetailShell>
  );
}
