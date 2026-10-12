import type { ContentType } from '@/features/recommend/types';

export type Kind = 'text' | 'textarea' | 'number' | 'url' | 'datetime' | 'select' | 'tristate' | 'checkbox' | 'lines' | 'hours';
export interface Field {
  name: string; label: string; kind: Kind; types: ContentType[];
  options?: { v: string; l: string }[]; help?: string; wide?: boolean;
}

const ALL: ContentType[] = ['place', 'event', 'activity'];
const PE: ContentType[] = ['place', 'event'];
const price = [{ v: 'unknown', l: 'Не знаем' }, { v: 'per_person', l: 'С человека' }, { v: 'total', l: 'За всех' }];
const place = (n: string, l: string, kind: Kind, extra: Partial<Field> = {}): Field => ({ name: n, label: l, kind, types: ['place'], ...extra });
const event = (n: string, l: string, kind: Kind, extra: Partial<Field> = {}): Field => ({ name: n, label: l, kind, types: ['event'], ...extra });
const both = (n: string, l: string, kind: Kind, extra: Partial<Field> = {}): Field => ({ name: n, label: l, kind, types: PE, ...extra });
const act = (n: string, l: string, kind: Kind, extra: Partial<Field> = {}): Field => ({ name: n, label: l, kind, types: ['activity'], ...extra });

export const FIELDS: Field[] = [
  { name: 'title', label: 'Название', kind: 'text', types: ALL, wide: true },
  { name: 'slug', label: 'Адрес страницы (slug)', kind: 'text', types: ALL, help: 'Латиница, цифры, дефисы: например kofeynya-na-baumana' },
  { name: 'description', label: 'Описание', kind: 'textarea', types: ALL, wide: true, help: 'Только факты. Ничего не выдумываем.' },
  place('address', 'Адрес', 'text', { wide: true }),
  place('district', 'Район', 'text'),
  place('lat', 'Широта', 'number'), place('lng', 'Долгота', 'number'),
  place('websiteUrl', 'Сайт', 'url'), both('bookingUrl', 'Ссылка на запись', 'url', { types: ['place'] }),
  event('ticketsUrl', 'Ссылка на билеты', 'url'),
  event('startsAt', 'Начало (время Казани)', 'datetime'), event('endsAt', 'Окончание', 'datetime'),
  event('expiresAt', 'Актуально до', 'datetime', { help: 'После этого момента событие не попадёт в подборку.' }),
  both('priceMin', 'Цена от, ₽', 'number', { help: 'Пусто = цена неизвестна (это не «бесплатно»). Бесплатно = 0.' }),
  both('priceMax', 'Цена до, ₽', 'number'),
  both('priceUnit', 'Цена указана', 'select', { options: price }),
  act('costMin', 'Стоимость от, ₽', 'number'), act('costMax', 'Стоимость до, ₽', 'number'),
  { name: 'ageMin', label: 'Возраст от', kind: 'number', types: ALL, help: '18 = только для взрослых.' },
  { name: 'ageMax', label: 'Возраст до', kind: 'number', types: ALL },
  place('minParticipants', 'Минимум человек', 'number'), place('maxParticipants', 'Максимум человек', 'number'),
  act('minParticipants', 'Минимум человек', 'number'), act('maxParticipants', 'Максимум человек', 'number'),
  event('capacity', 'Вместимость', 'number'),
  both('soloFriendly', 'Можно одному', 'tristate'), both('joinOpenGroup', 'Можно присоединиться к чужой группе', 'tristate'),
  both('requiresBooking', 'Нужна запись', 'tristate'),
  place('indoorOutdoor', 'Где', 'select', { options: [{ v: 'unknown', l: 'Не знаем' }, { v: 'indoor', l: 'В помещении' }, { v: 'outdoor', l: 'На улице' }, { v: 'both', l: 'И там и там' }] }),
  event('indoorOutdoor', 'Где', 'select', { options: [{ v: '', l: 'Как у площадки' }, { v: 'indoor', l: 'В помещении' }, { v: 'outdoor', l: 'На улице' }, { v: 'both', l: 'И там и там' }] }),
  place('durationMinutes', 'Длительность, мин', 'number'), act('durationMinutes', 'Длительность, мин', 'number'),
  place('openingHours', 'Часы работы', 'hours', { wide: true, help: 'По строке: «Пн–Пт: 10:00–22:00»' }),
  act('stepsRichText', 'Как это сделать', 'textarea', { wide: true, help: 'Абзацы — через пустую строку, списки — строки с «- ». HTML не поддерживается.' }),
  act('requiredMaterials', 'Что понадобится', 'lines', { wide: true, help: 'По одному пункту в строке.' }),
  both('sourceUrl', 'Ссылка на первоисточник', 'url', { wide: true, types: PE }),
  act('sourceUrl', 'Ссылка на источник', 'url', { wide: true }),
  both('verifiedAt', 'Данные проверены (время Казани)', 'datetime', { help: 'Для события обязательно перед публикацией.' }),
];

export const STATUS_OPTIONS: Record<ContentType, { v: string; l: string }[]> = {
  place: [{ v: 'draft', l: 'Черновик' }, { v: 'published', l: 'Опубликовано' }, { v: 'archived', l: 'В архиве' }],
  activity: [{ v: 'draft', l: 'Черновик' }, { v: 'published', l: 'Опубликовано' }, { v: 'archived', l: 'В архиве' }],
  event: [{ v: 'draft', l: 'Черновик' }, { v: 'published', l: 'Опубликовано' }, { v: 'cancelled', l: 'Отменено' }, { v: 'sold_out', l: 'Билеты закончились' }, { v: 'archived', l: 'В архиве' }],
};
export const STATUS_LABEL: Record<string, string> = {
  draft: 'Черновик', published: 'Опубликовано', cancelled: 'Отменено', sold_out: 'Билеты закончились', archived: 'В архиве',
};
