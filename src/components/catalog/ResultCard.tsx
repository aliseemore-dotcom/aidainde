import Link from 'next/link';
import { Art } from '@/components/ui/Art';
import { ArrowUpRight, ICON_STROKE } from '@/components/ui/icons';
import { illustrationFor, formatPrice, TYPE_LABEL, TYPE_PATH } from '@/features/catalog/presentation';
import { NOTE_TEXT, type NoteCode } from '@/features/recommend/types';
import { placeKindLabel } from '@/features/catalog/place-kinds';
import { formatEventMeta } from '@/lib/date-kazan';

export interface CardData {
  type: 'place' | 'event' | 'activity'; slug: string; title: string; tags: string[];
  priceMin: number | null; priceMax: number | null; priceUnit: 'per_person' | 'total' | 'unknown';
  startsAt?: string | null; status?: string; isDemo?: boolean;
  reasons?: string[]; notes?: NoteCode[]; district?: string | null; kind?: string | null;
}

const STATUS_TEXT: Record<string, string> = { cancelled: 'Отменено', sold_out: 'Билеты закончились' };

/** Карточка в списках. Фото в карточках не показываем (дизайн-код): только иллюстрация-плитка. */
export function ResultCard({ card }: { card: CardData }) {
  const { art, warm } = illustrationFor(card.tags);
  const meta = [placeKindLabel(card.kind) ?? TYPE_LABEL[card.type], card.startsAt ? formatEventMeta(new Date(card.startsAt)) : null, card.district].filter(Boolean).join(' · ');
  const unavailable = card.status ? STATUS_TEXT[card.status] : undefined;
  return (
    <article className="k-card k-card--wide k-card--link">
      <div className={`k-card__art${warm ? ' k-card__art--warm' : ''}`}><Art name={art} /></div>
      <div className="k-card__body">
        <h3 className="k-card__title">
          <Link href={`/${TYPE_PATH[card.type]}/${card.slug}`}>{card.title}</Link>
        </h3>
        <p className="k-card__meta">{meta}</p>
        {card.reasons && card.reasons.length > 0 && (
          <p className="k-card__reasons" aria-label="Почему подходит">
            {card.reasons.map((r) => <span key={r} className="k-tag">{r}</span>)}
          </p>
        )}
        {card.isDemo && <span className="k-tag k-tag--danger">Демо, вымышленная запись</span>}
        {unavailable && <span className="k-tag k-tag--danger">{unavailable}</span>}
        {card.notes && card.notes.length > 0 && (
          <ul className="k-card__notes">{card.notes.map((n) => <li key={n}>{NOTE_TEXT[n]}</li>)}</ul>
        )}
      </div>
      <div className="k-card__foot">
        <span className="k-card__meta">{formatPrice(card.priceMin, card.priceMax, card.priceUnit)}</span>
        <span className="k-btn__circle" aria-hidden="true"><ArrowUpRight size={20} strokeWidth={ICON_STROKE} /></span>
      </div>
    </article>
  );
}
