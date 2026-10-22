import Link from 'next/link';
import { Art } from '@/components/ui/Art';
import { ArrowUpRight, ICON_STROKE } from '@/components/ui/icons';
import { illustrationFor, formatPrice, directionLabel, TYPE_LABEL, TYPE_PATH } from '@/features/catalog/presentation';
import { NOTE_TEXT, type NoteCode } from '@/features/recommend/types';
import { placeKindLabel } from '@/features/catalog/place-kinds';
import { formatEventWhen } from '@/lib/date-kazan';

export interface CardData {
  type: 'place' | 'event' | 'activity'; slug: string; title: string; tags: string[];
  priceMin: number | null; priceMax: number | null; priceUnit: 'per_person' | 'total' | 'unknown';
  startsAt?: string | null; status?: string; isDemo?: boolean;
  reasons?: string[]; notes?: NoteCode[]; district?: string | null; kind?: string | null;
  description?: string; address?: string | null; venueTitle?: string | null;
}

const STATUS_TEXT: Record<string, string> = { cancelled: 'Отменено', sold_out: 'Билеты закончились' };

/** Короткое описание для карточки: без обрыва на полуслове. */
const snippet = (s: string, max = 150) => (s.length <= max ? s : `${s.slice(0, max).replace(/\s+\S*$/, '')}…`);

/** Карточка в списках. Фото в карточках не показываем (дизайн-код): только иллюстрация-плитка. */
export function ResultCard({ card }: { card: CardData }) {
  const { art, warm } = illustrationFor(card.tags, card.kind);
  const meta = [placeKindLabel(card.kind) ?? TYPE_LABEL[card.type], directionLabel(card.tags), card.startsAt ? formatEventWhen(new Date(card.startsAt)) : null, card.district].filter(Boolean).join(' · ');
  // «Цена уточняется» показана внизу карточки, а «проверьте часы» — общий совет, он есть на странице записи
  const notes = (card.notes ?? []).filter((n) => n !== 'price_unknown' && n !== 'check_hours');
  const where = [card.venueTitle, card.address].filter(Boolean).join(', ');
  const unavailable = card.status ? STATUS_TEXT[card.status] : undefined;
  return (
    <article className="k-card k-card--wide k-card--link">
      <div className={`k-card__art${warm ? ' k-card__art--warm' : ''}`}><Art name={art} /></div>
      <div className="k-card__body">
        <h3 className="k-card__title">
          <Link href={`/${TYPE_PATH[card.type]}/${card.slug}`}>{card.title}</Link>
        </h3>
        <p className="k-card__meta">{meta}</p>
        {where && <p className="k-card__where">{where}</p>}
        {card.description && <p className="k-card__desc">{snippet(card.description)}</p>}
        {card.reasons && card.reasons.length > 0 && (
          <p className="k-card__reasons" aria-label="Почему подходит">
            {card.reasons.map((r) => <span key={r} className="k-tag">{r}</span>)}
          </p>
        )}
        {card.isDemo && <span className="k-tag k-tag--danger">Демо, вымышленная запись</span>}
        {unavailable && <span className="k-tag k-tag--danger">{unavailable}</span>}
        {card.status === 'draft' && <span className="k-tag k-tag--warm">Черновик</span>}
        {notes.length > 0 && (
          <ul className="k-card__notes">{notes.map((n) => <li key={n}>{NOTE_TEXT[n]}</li>)}</ul>
        )}
      </div>
      <div className="k-card__foot">
        <span className="k-card__meta">{formatPrice(card.priceMin, card.priceMax, card.priceUnit)}</span>
        <span className="k-btn__circle" aria-hidden="true"><ArrowUpRight size={20} strokeWidth={ICON_STROKE} /></span>
      </div>
    </article>
  );
}
