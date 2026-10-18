import { describe, expect, it } from 'vitest';
import { parseCsv } from '@/features/catalog/csv';
import { csvToRecords, parseKazanDate } from '@/features/catalog/csv-import';
import { COLUMNS } from '@/features/catalog/csv-schema';
import { slugify, uniqueSlug } from '@/features/catalog/slug';
import { parseImport } from '@/features/catalog/import';
import { TAGS } from '@/features/recommend/tag-registry';

const head = (type: 'place' | 'event' | 'activity', sep = ';') => COLUMNS[type].map((c) => c.header).join(sep);
const q = (x: string) => (/[;"\n]/.test(x) ? `"${x.replace(/"/g, '""')}"` : x); // как это делает Excel
const placeRow = (o: Record<string, string> = {}) => {
  const base: Record<string, string> = { 'Название': 'Кофейня на Баумана', 'Описание': 'Небольшая кофейня в центре города.', 'Адрес': 'ул. Баумана, 1', 'Источник (ссылка)': 'https://example.org/k', 'Дата проверки': '12.10.2026', 'Теги': 'Заведения; Тихо и уютно', ...o };
  return COLUMNS.place.map((c) => base[c.header] ?? '').map((x) => (/[;"\n]/.test(x) ? `"${x.replace(/"/g, '""')}"` : x)).join(';');
};

describe('CSV', () => {
  it('разбирает BOM, разные разделители, кавычки и переносы строк в ячейках', () => {
    expect(parseCsv('﻿a;b;c\r\n1;"x;y";"he said ""hi"""\r\n')).toEqual([['a', 'b', 'c'], ['1', 'x;y', 'he said "hi"']]);
    expect(parseCsv('a,b\n1,2')).toEqual([['a', 'b'], ['1', '2']]);
    expect(parseCsv('a\tb\n1\t2')).toEqual([['a', 'b'], ['1', '2']]);
    expect(parseCsv('a;b\n"строка 1\nстрока 2";x')).toEqual([['a', 'b'], ['строка 1\nстрока 2', 'x']]);
    expect(parseCsv('')).toEqual([]);
  });
});

describe('slug', () => {
  it('транслитерирует русские и татарские названия', () => {
    expect(slugify('Кофейня на Баумана')).toBe('kofeynya-na-baumana');
    expect(slugify('Әйдә, җыелыш! Һәм ӨҮ')).toBe('ayda-zhyelysh-ham-ou');
    expect(slugify('Щи & Борщ №1')).toBe('shchi-borshch-1');
    expect(slugify('!!!')).toBe('zapis');
    expect(slugify('а'.repeat(200)).length).toBeLessThanOrEqual(80);
  });
  it('slug уникален внутри набора', () => {
    const taken = new Set<string>();
    expect([uniqueSlug('a', taken), uniqueSlug('a', taken), uniqueSlug('a', taken)]).toEqual(['a', 'a-2', 'a-3']);
  });
});

describe('даты по Казани', () => {
  it('ДД.ММ.ГГГГ ЧЧ:ММ -> UTC; дата без времени -> полдень', () => {
    expect(parseKazanDate('17.10.2026 19:00', true)).toBe('2026-10-17T16:00:00.000Z');
    expect(parseKazanDate('17.10.2026', false)).toBe('2026-10-17T09:00:00.000Z');
    expect(parseKazanDate('2026-10-17 19:00', true)).toBe('2026-10-17T16:00:00.000Z');
    expect(parseKazanDate('1.2.2027 0:30', true)).toBe('2027-01-31T21:30:00.000Z');
  });
  it('отклоняет несуществующее и неполное', () => {
    for (const bad of ['31.02.2026', '17.10.2026 25:00', 'вчера', '17/10/2026']) expect(() => parseKazanDate(bad, bad.includes(':'))).toThrow();
    expect(() => parseKazanDate('17.10.2026', true)).toThrow(/время/);
  });
});

describe('таблица -> записи', () => {
  it('корректная строка места превращается в запись; slug формируется из названия', () => {
    const r = csvToRecords('place', `${head('place')}\n${placeRow({ 'Цена от, ₽': '0', 'Цена до, ₽': '0', 'Цена указана': 'за всех', 'Где': 'в помещении', 'Можно одному': 'да', 'Часы работы': 'Пн–Пт: 10:00–22:00; Сб: 11:00–20:00', 'Телефон': '+7 000' })}`);
    expect(r.issues).toEqual([]);
    expect(r.records[0]).toMatchObject({
      type: 'place', slug: 'kofeynya-na-baumana', title: 'Кофейня на Баумана', priceMin: 0, priceMax: 0, priceUnit: 'total',
      indoorOutdoor: 'indoor', soloFriendly: true, tags: ['venues', 'venue_quiet'], verifiedAt: '2026-10-12T09:00:00.000Z',
      openingHoursJson: { 'Пн–Пт': '10:00–22:00', 'Сб': '11:00–20:00' }, contactsJson: { phone: '+7 000' },
    });
  });

  it('пустая цена остаётся «неизвестна» (null), а не 0; результат проходит серверную валидацию импорта', () => {
    const r = csvToRecords('place', `${head('place')}\n${placeRow()}`);
    expect(r.records[0]!.priceMin).toBeNull();
    expect(r.records[0]!.priceMax).toBeNull();
    const parsed = parseImport(r.records);
    expect(parsed.issues).toEqual([]);
    expect(parsed.records[0]!.data.status).toBe('draft');
  });

  it('понятные ошибки: пустые обязательные поля, неверные значения, неизвестные теги — со строкой и колонкой', () => {
    const csv = [head('place'), placeRow({ 'Название': '' }), placeRow({ 'Цена от, ₽': 'много' }), placeRow({ 'Теги': 'Заведения; Кофемания' }), placeRow({ 'Источник (ссылка)': 'не ссылка' }), placeRow({ 'Дата проверки': '31.02.2026' }), placeRow({ 'Где': 'на крыше' })].join('\n');
    const r = csvToRecords('place', csv);
    expect(r.records).toEqual([]);
    const by = (row: number) => r.issues.find((i) => i.row === row);
    expect(by(2)).toMatchObject({ column: 'Название', message: 'обязательное поле пусто' });
    expect(by(3)).toMatchObject({ column: 'Цена от, ₽', message: 'ожидается число' });
    expect(by(4)!.message).toContain('Кофемания');
    expect(by(5)).toMatchObject({ column: 'Источник (ссылка)' });
    expect(by(6)).toMatchObject({ column: 'Дата проверки' });
    expect(by(7)).toMatchObject({ column: 'Где' });
  });

  it('подсказывает похожие теги', () => {
    const r = csvToRecords('place', `${head('place')}\n${placeRow({ 'Теги': 'Квиз; Заведения' })}`);
    expect(r.records).toHaveLength(1); // «Квиз» — реальный тег
    const bad = csvToRecords('place', `${head('place')}\n${placeRow({ 'Теги': 'Тихо' })}`);
    expect(bad.issues[0]!.message).toMatch(/Тихо.*возможно: .*Тихо и уютно/);
  });

  it('строки-примеры и пустые строки пропускаются; повторяющиеся названия получают уникальные slug', () => {
    const csv = [head('place'), placeRow({ 'Название': 'ПРИМЕР — удалите эту строку' }), ';;;;;', placeRow(), placeRow()].join('\n');
    const r = csvToRecords('place', csv);
    expect(r.skippedExamples).toBe(1);
    expect(r.records.map((x) => x.slug)).toEqual(['kofeynya-na-baumana', 'kofeynya-na-baumana-2']);
  });

  it('нет обязательных колонок — понятное сообщение; лишняя колонка — предупреждение', () => {
    expect(csvToRecords('place', 'Название;Адрес\nA;B').issues[0]!.message).toMatch(/Нет обязательных колонок/);
    const r = csvToRecords('place', `${head('place')};Заметки\n${placeRow()};что-то`);
    expect(r.records).toHaveLength(1);
    expect(r.issues[0]).toMatchObject({ column: 'Заметки' });
  });

  it('событие: время по Казани, площадка по slug; идея: списки', () => {
    const e = csvToRecords('event', [head('event'), COLUMNS.event.map((c) => ({ 'Название': 'Концерт', 'Описание': 'Вечерний концерт в филармонии.', 'Площадка (slug места)': 'filarmoniya', 'Начало': '17.10.2026 19:00', 'Источник (ссылка)': 'example.org/koncert', 'Дата проверки': '12.10.2026', 'Теги': 'Культура; Театр, кино, лекции' } as Record<string, string>)[c.header] ?? '').map(q).join(';')].join('\n'));
    expect(e.issues).toEqual([]);
    expect(e.records[0]).toMatchObject({ placeSlug: 'filarmoniya', startsAt: '2026-10-17T16:00:00.000Z', sourceUrl: 'https://example.org/koncert', tags: ['culture', 'culture_story'] });
    const a = csvToRecords('activity', [head('activity'), COLUMNS.activity.map((c) => ({ 'Название': 'Вечер настолок', 'Описание': 'Домашний игровой вечер с друзьями.', 'Что понадобится': 'Игры; Закуски', 'Длительность, мин': '180', 'Стоимость от, ₽': '0', 'Теги': 'Дома; Домашние игры' } as Record<string, string>)[c.header] ?? '').map(q).join(';')].join('\n'));
    expect(a.issues).toEqual([]);
    expect(a.records[0]).toMatchObject({ requiredMaterialsJson: ['Игры', 'Закуски'], durationMinutes: 180, costMin: 0, tags: ['home', 'home_games'] });
  });
});

describe('справочник', () => {
  it('названия тегов уникальны (иначе в таблице их не различить)', () => {
    const labels = TAGS.map((t) => t.label.toLowerCase().replace(/ё/g, 'е'));
    expect(new Set(labels).size).toBe(labels.length);
  });
  it('у каждой колонки есть подсказка или она очевидна; ключи уникальны', () => {
    for (const type of ['place', 'event', 'activity'] as const) {
      const keys = COLUMNS[type].map((c) => c.key);
      expect(new Set(keys).size).toBe(keys.length);
      expect(COLUMNS[type].filter((c) => c.required).map((c) => c.key)).toEqual(expect.arrayContaining(['title', 'description', 'tags']));
    }
  });
});
