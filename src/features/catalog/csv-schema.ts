import type { ContentType } from '@/features/recommend/types';

/**
 * Колонки таблицы для сбора контента (Excel / Google Таблицы). Единственный источник правды:
 * по нему строится шаблон .xlsx и разбор CSV. Заголовки на русском, звёздочка — обязательное поле.
 */
export type ColKind = 'text' | 'long' | 'number' | 'url' | 'date' | 'datetime' | 'priceUnit' | 'setting' | 'tri' | 'tags' | 'list' | 'hours';
export interface Col { key: string; header: string; kind: ColKind; required?: boolean; hint: string }

const c = (key: string, header: string, kind: ColKind, hint: string, required = false): Col => ({ key, header, kind, hint, required });

const TAGS = c('tags', 'Теги', 'tags', 'Из листа «Теги», через точку с запятой. Нужен минимум один тег-направление (Прогулки, Заведения, Игры, Культура, Спокойный отдых).', true);
const PRICE = [
  c('priceMin', 'Цена от, ₽', 'number', 'Число. Пусто = цена неизвестна (это НЕ «бесплатно»). Бесплатно = 0.'),
  c('priceMax', 'Цена до, ₽', 'number', 'Число или пусто.'),
  c('priceUnit', 'Цена указана', 'priceUnit', 'с человека / за всех / неизвестно'),
];

export const COLUMNS: Record<ContentType, Col[]> = {
  place: [
    c('title', 'Название', 'text', 'Как называется место.', true),
    c('slug', 'Адрес страницы (slug)', 'text', 'Латиницей. Можно оставить пустым: сформируется из названия.'),
    c('description', 'Описание', 'long', 'Только проверенные факты, от 10 символов. Ничего не выдумываем.', true),
    c('address', 'Адрес', 'text', 'Улица, дом.', true),
    c('district', 'Район', 'text', 'Необязательно.'),
    c('lat', 'Широта', 'number', 'Необязательно, например 55.7961.'),
    c('lng', 'Долгота', 'number', 'Необязательно, например 49.1064.'),
    c('websiteUrl', 'Сайт', 'url', 'Ссылка на официальный сайт.'),
    c('bookingUrl', 'Ссылка на запись', 'url', 'Если есть онлайн-запись.'),
    c('sourceUrl', 'Источник (ссылка)', 'url', 'Откуда взяты данные: официальная страница.', true),
    c('verifiedAt', 'Дата проверки', 'date', 'ДД.ММ.ГГГГ: когда вы сверили данные с источником.', true),
    ...PRICE,
    c('ageMin', 'Возраст от', 'number', '18 = только для взрослых.'),
    c('ageMax', 'Возраст до', 'number', 'Необязательно.'),
    c('minParticipants', 'Минимум человек', 'number', 'Если есть ограничение.'),
    c('maxParticipants', 'Максимум человек', 'number', 'Если есть ограничение.'),
    c('soloFriendly', 'Можно одному', 'tri', 'да / нет / неизвестно'),
    c('requiresBooking', 'Нужна запись', 'tri', 'да / нет / неизвестно'),
    c('indoorOutdoor', 'Где', 'setting', 'в помещении / на улице / и там и там / неизвестно'),
    c('openingHours', 'Часы работы', 'hours', 'Пн–Пт: 10:00–22:00; Сб–Вс: 11:00–20:00'),
    c('phone', 'Телефон', 'text', 'Необязательно.'),
    c('email', 'Почта', 'text', 'Необязательно.'),
    TAGS,
  ],
  event: [
    c('title', 'Название', 'text', 'Как называется событие.', true),
    c('slug', 'Адрес страницы (slug)', 'text', 'Латиницей. Можно оставить пустым.'),
    c('description', 'Описание', 'long', 'Только проверенные факты, от 10 символов.', true),
    c('placeSlug', 'Площадка (slug места)', 'text', 'slug места из листа «Места», если оно уже загружено.'),
    c('startsAt', 'Начало', 'datetime', 'ДД.ММ.ГГГГ ЧЧ:ММ по времени Казани.', true),
    c('endsAt', 'Окончание', 'datetime', 'Необязательно, тот же формат.'),
    c('sourceUrl', 'Источник (ссылка)', 'url', 'Официальная страница события.', true),
    c('ticketsUrl', 'Ссылка на билеты', 'url', 'Страница организатора, не наша.'),
    c('verifiedAt', 'Дата проверки', 'date', 'ДД.ММ.ГГГГ. Без неё событие не попадёт в подборку.', true),
    c('expiresAt', 'Актуально до', 'datetime', 'Необязательно: после этого события в подборке не будет.'),
    ...PRICE,
    c('ageMin', 'Возраст от', 'number', '18 = только для взрослых.'),
    c('ageMax', 'Возраст до', 'number', 'Необязательно.'),
    c('capacity', 'Вместимость', 'number', 'Сколько всего мест, если известно.'),
    c('indoorOutdoor', 'Где', 'setting', 'пусто = как у площадки'),
    c('requiresBooking', 'Нужна запись', 'tri', 'да / нет / неизвестно'),
    TAGS,
  ],
  activity: [
    c('title', 'Название', 'text', 'Как называется идея.', true),
    c('slug', 'Адрес страницы (slug)', 'text', 'Латиницей. Можно оставить пустым.'),
    c('description', 'Описание', 'long', 'Коротко о чём идея, от 10 символов.', true),
    c('stepsRichText', 'Как это сделать', 'long', 'Шаги. Абзацы — пустой строкой, списки — строками с «- ».'),
    c('requiredMaterials', 'Что понадобится', 'list', 'Через точку с запятой.'),
    c('durationMinutes', 'Длительность, мин', 'number', 'Примерно.'),
    c('costMin', 'Стоимость от, ₽', 'number', 'Пусто = неизвестно; 0 = бесплатно.'),
    c('costMax', 'Стоимость до, ₽', 'number', 'Необязательно.'),
    c('minParticipants', 'Минимум человек', 'number', ''),
    c('maxParticipants', 'Максимум человек', 'number', ''),
    c('ageMin', 'Возраст от', 'number', ''),
    c('ageMax', 'Возраст до', 'number', ''),
    c('sourceUrl', 'Источник (ссылка)', 'url', 'Если идея взята из источника.'),
    TAGS,
  ],
};

export const SHEET_NAME: Record<ContentType, string> = { place: 'Места', event: 'События', activity: 'Идеи на дом' };
export const TYPE_BY_ARG: Record<string, ContentType> = { places: 'place', events: 'event', activities: 'activity' };
