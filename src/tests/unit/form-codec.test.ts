import { describe, expect, it } from 'vitest';
import { buildPayload, fromKazanInput, initialForm, toKazanInput } from '@/components/admin/form-codec';
import { placeInput, eventInput } from '@/features/catalog/validators';

describe('кодек формы админки', () => {
  it('время вводится и показывается по Казани (UTC+3) и переживает круг', () => {
    expect(fromKazanInput('2026-10-17T19:00')).toBe('2026-10-17T16:00:00.000Z');
    expect(toKazanInput('2026-10-17T16:00:00.000Z')).toBe('2026-10-17T19:00');
    expect(toKazanInput(fromKazanInput('2026-12-31T23:30'))).toBe('2026-12-31T23:30');
    expect(toKazanInput('2026-10-17T21:30:00.000Z')).toBe('2026-10-18T00:30'); // за полночь по Казани
    expect(fromKazanInput('')).toBeNull();
    expect(toKazanInput(null)).toBe('');
  });

  it('пустая цена — null (неизвестно), а 0 — бесплатно; пустое — не «0»', () => {
    const { form } = initialForm('place', null);
    const empty = buildPayload('place', { ...form, title: 'Тест', slug: 'test', description: 'x'.repeat(20), address: 'Адрес', sourceUrl: 'https://example.com' }, ['walks'], [], [], 'draft');
    expect(empty.priceMin).toBeNull();
    expect(empty.priceMax).toBeNull();
    const free = buildPayload('place', { ...form, priceMin: '0', priceMax: '0' }, ['walks'], [], [], 'draft');
    expect(free.priceMin).toBe(0);
  });

  it('собранная форма проходит серверную валидацию (место и событие)', () => {
    const p = initialForm('place', null).form;
    const place = buildPayload('place', { ...p, title: 'Кофейня', slug: 'kofeynya', description: 'Описание кофейни для проверки.', address: 'ул. Пример, 1', sourceUrl: 'https://example.com/k', openingHours: 'Пн–Пт: 10:00–22:00\nСб: 11:00–20:00', phone: '+7 000 000-00-00', soloFriendly: 'true' }, ['venues'], [], [], 'published');
    const parsedPlace = placeInput.parse(place);
    expect(parsedPlace.openingHoursJson).toEqual({ 'Пн–Пт': '10:00–22:00', 'Сб': '11:00–20:00' });
    expect(parsedPlace.soloFriendly).toBe(true);
    const e = initialForm('event', null).form;
    const ev = buildPayload('event', { ...e, title: 'Концерт', slug: 'koncert', description: 'Описание концерта для проверки.', sourceUrl: 'https://example.com/c', startsAt: '2026-10-17T19:00', verifiedAt: '2026-10-12T12:00', indoorOutdoor: '' }, ['culture'], [], [{ startsAt: '2026-10-24T19:00', endsAt: '', status: 'sold_out', ticketsUrl: '' }], 'published');
    const parsed = eventInput.parse(ev);
    expect(parsed.startsAt.toISOString()).toBe('2026-10-17T16:00:00.000Z');
    expect(parsed.indoorOutdoor).toBeNull();
    expect(parsed.occurrences[0]!.status).toBe('sold_out');
  });

  it('тип места: пустой выбор уходит как null, выбранный — как ключ; восстанавливается при редактировании', () => {
    const { form } = initialForm('place', null);
    expect(form.kind).toBe('');
    expect(buildPayload('place', form, ['venues'], [], [], 'draft').kind).toBeNull();
    expect(buildPayload('place', { ...form, kind: 'museum' }, ['culture'], [], [], 'draft').kind).toBe('museum');
    expect(initialForm('place', { kind: 'bar', title: 'A', slug: 'a', tags: [], media: [] }).form.kind).toBe('bar');
  });

  it('форма редактирования восстанавливает сохранённые значения', () => {
    const { form, tags } = initialForm('place', { title: 'A', slug: 'a', priceMin: 0, soloFriendly: false, openingHoursJson: { 'Пн': '10–20' }, tags: ['walks'], status: 'published', isDemo: true });
    expect(form.priceMin).toBe('0');
    expect(form.soloFriendly).toBe('false');
    expect(form.openingHours).toBe('Пн: 10–20');
    expect(form.status).toBe('published');
    expect(form.isDemo).toBe('true');
    expect(tags).toEqual(['walks']);
  });
});
