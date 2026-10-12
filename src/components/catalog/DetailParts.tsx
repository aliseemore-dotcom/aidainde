import Link from 'next/link';
import type { ReactNode } from 'react';
import { LogoLink } from '@/components/ui/Logo';
import { Art } from '@/components/ui/Art';
import { ArrowLeft, ICON_STROKE } from '@/components/ui/icons';
import { ExternalLink } from './MapLink';
import { illustrationFor } from '@/features/catalog/presentation';
import { tagLabel } from '@/features/recommend/tag-registry';
import type { ContentDetail } from '@/features/catalog/queries';

export function DetailShell({ d, backHref, backLabel, children }: { d: ContentDetail; backHref: string; backLabel: string; children: ReactNode }) {
  const { art, warm } = illustrationFor(d.tags);
  return (
    <div className="page">
      <header className="pagehead">
        <Link href={backHref} className="k-icon-btn" aria-label={backLabel}><ArrowLeft size={22} strokeWidth={ICON_STROKE} aria-hidden="true" /></Link>
        <LogoLink />
      </header>
      <div className="stack">
        {d.isDemo && <p className="demo-flag" role="note">Демо, вымышленная запись: не настоящее место или событие.</p>}
        {d.media.length > 0 ? (
          <div className="gallery">
            {d.media.map((m) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={m.url} src={m.url} alt={m.alt} loading="lazy" referrerPolicy="no-referrer" />
            ))}
          </div>
        ) : (
          <div className={`detail-art${warm ? ' detail-art--warm' : ''}`}><Art name={art} /></div>
        )}
        {children}
      </div>
    </div>
  );
}

export function TagList({ tags }: { tags: string[] }) {
  if (!tags.length) return null;
  return <ul className="chips" aria-label="Теги" style={{ listStyle: 'none', margin: 0, padding: 0 }}>{tags.map((t) => <li key={t}><span className="k-tag">{tagLabel(t)}</span></li>)}</ul>;
}

export function Facts({ items }: { items: { label: string; value: ReactNode; wide?: boolean }[] }) {
  const rows = items.filter((i) => i.value !== null && i.value !== undefined && i.value !== '');
  if (!rows.length) return null;
  return (
    <dl className="facts">
      {rows.map((i) => <div key={i.label} className={i.wide ? 'facts__wide' : undefined}><dt>{i.label}</dt><dd>{i.value}</dd></div>)}
    </dl>
  );
}

const dateFmt = new Intl.DateTimeFormat('ru-RU', { timeZone: 'Europe/Moscow', day: 'numeric', month: 'long', year: 'numeric' });

export function SourceBlock({ sourceUrl, verifiedAt }: { sourceUrl?: string | null; verifiedAt?: Date | null }) {
  return (
    <div className="stack stack--tight">
      {sourceUrl && <div className="actions"><ExternalLink href={sourceUrl}>Официальный источник</ExternalLink></div>}
      <p className="disclaimer">
        {verifiedAt ? `Данные проверены ${dateFmt.format(verifiedAt).replace(/\s?г\.$/, '')}. ` : 'Дата проверки данных не указана. '}
        Информация на внешних площадках могла измениться, поэтому проверяйте актуальность у организатора.
      </p>
    </div>
  );
}

export function ageText(min?: number | null, max?: number | null): string | null {
  if (min == null && max == null) return null;
  if (min != null && max != null) return `${min}–${max} лет`;
  return min != null ? (min >= 18 ? '18+' : `от ${min} лет`) : `до ${max} лет`;
}

export function groupText(min?: number | null, max?: number | null): string | null {
  if (min == null && max == null) return null;
  if (min != null && max != null) return `${min}–${max} человек`;
  return min != null ? `от ${min} человек` : `до ${max} человек`;
}
