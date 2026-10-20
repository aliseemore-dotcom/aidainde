import type { ContentType } from '@/features/recommend/types';

/**
 * Правила определения дубликатов (одинаковы для проверки файла и для сверки с каталогом).
 *  - место:     то же название + тот же адрес;
 *  - событие:   то же название + то же время начала (до минуты) + та же площадка;
 *  - идея:      то же название.
 * Сравнение нечувствительно к регистру, «ё/е», кавычкам и знакам препинания. В адресе не учитываются слова
 * «ул., улица, проспект, дом, г., Казань…» и порядок слов: «ул. Баумана, 7» = «Баумана ул., 7».
 * Одно и то же заведение под разными названиями автоматически не распознаётся: такие случаи — на ручной проверке.
 */
const ADDRESS_NOISE = new Set([
  'ул', 'улица', 'пр', 'проспект', 'пер', 'переулок', 'наб', 'набережная', 'пл', 'площадь', 'бульвар', 'ш', 'шоссе', 'тракт',
  'д', 'дом', 'г', 'город', 'казань', 'республика', 'татарстан', 'рт', 'россия',
]);

const tokens = (s: string): string[] => s.toLowerCase().replace(/ё/g, 'е').split(/[^a-zа-я0-9]+/).filter(Boolean);
export const normTitle = (s: string): string => tokens(s).join('');
export const normAddress = (s: string): string => tokens(s).filter((t) => !ADDRESS_NOISE.has(t)).sort().join(' ');

export interface DuplicateFields { title: string; address?: string | null; startsAt?: Date | string | null; placeRef?: string | null }

export function duplicateKey(type: ContentType, f: DuplicateFields): string {
  const title = normTitle(f.title);
  if (type === 'place') return `place|${title}|${normAddress(f.address ?? '')}`;
  if (type === 'event') {
    const t = f.startsAt ? new Date(f.startsAt).toISOString().slice(0, 16) : '';
    return `event|${title}|${t}|${f.placeRef ?? ''}`;
  }
  return `activity|${title}`;
}
