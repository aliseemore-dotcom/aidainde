// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

const push = vi.fn();
const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, refresh }) }));
vi.mock('next/link', () => ({ default: ({ href, children, ...r }: { href: string; children: React.ReactNode }) => <a href={href} {...r}>{children}</a> }));

import { ContentForm } from '@/components/admin/ContentForm';

afterEach(() => { cleanup(); vi.restoreAllMocks(); push.mockReset(); refresh.mockReset(); });

const fetchMock = (status: number, body: unknown) =>
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }));

const fill = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });

describe('форма админки', () => {
  it('новое место: заполнение, выбор тегов, публикация отправляет корректный JSON', async () => {
    const f = fetchMock(201, { id: '5b2f2b8e-0000-4000-8000-000000000001' });
    render(<ContentForm type="place" initial={null} places={[]} role="editor" />);
    fill('Название', 'Кофейня у реки');
    fill('Адрес страницы (slug)', 'kofeynya-u-reki');
    fill('Описание', 'Небольшая кофейня с видом на реку.');
    fill('Адрес', 'ул. Примерная, 1');
    fill('Ссылка на первоисточник', 'https://example.com/k');
    fireEvent.click(screen.getByRole('button', { name: 'Заведения' }));
    expect(screen.getByRole('button', { name: 'Заведения' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Опубликовать' }));
    await waitFor(() => expect(f).toHaveBeenCalled());
    const [url, init] = f.mock.calls[0]!;
    expect(url).toBe('/api/admin/places');
    expect(init!.method).toBe('POST');
    const body = JSON.parse(init!.body as string);
    expect(body).toMatchObject({ status: 'published', title: 'Кофейня у реки', slug: 'kofeynya-u-reki', tags: ['venues'], priceMin: null, priceMax: null, isDemo: false });
    await waitFor(() => expect(push).toHaveBeenCalledWith('/admin/places/5b2f2b8e-0000-4000-8000-000000000001'));
  });

  it('slug предлагается из названия, но не перетирает введённый вручную', () => {
    render(<ContentForm type="place" initial={null} places={[]} role="editor" />);
    const title = screen.getByLabelText('Название');
    fireEvent.change(title, { target: { value: 'Кофейня на Баумана' } });
    fireEvent.blur(title);
    expect(screen.getByLabelText('Адрес страницы (slug)')).toHaveValue('kofeynya-na-baumana');
    fill('Адрес страницы (slug)', 'moy-slug');
    fireEvent.change(title, { target: { value: 'Другое название' } });
    fireEvent.blur(title);
    expect(screen.getByLabelText('Адрес страницы (slug)')).toHaveValue('moy-slug');
  });

  it('ошибки публикации показываются списком и не теряют введённое', async () => {
    fetchMock(422, { error: { code: 'PUBLISH_REQUIREMENTS', message: 'Для публикации не хватает данных', details: [{ field: 'verifiedAt', message: 'Отметьте, когда данные проверены по первоисточнику' }] } });
    render(<ContentForm type="event" initial={null} places={[{ id: 'p1', title: 'Площадка' }]} role="editor" />);
    fill('Название', 'Концерт');
    fireEvent.click(screen.getByRole('button', { name: 'Опубликовать' }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Для публикации не хватает данных');
    expect(alert).toHaveTextContent('verifiedAt');
    expect(screen.getByLabelText('Название')).toHaveValue('Концерт');
  });

  it('редактирование: PATCH, «Снять с публикации», удаление только у admin', async () => {
    const initial = { title: 'Музей', slug: 'muzey', description: 'Описание музея.', address: 'Адрес', status: 'published', tags: ['culture'], sourceUrl: 'https://example.com', media: [], isDemo: false };
    const f = fetchMock(200, { ok: true });
    const { unmount } = render(<ContentForm type="place" id="5b2f2b8e-0000-4000-8000-000000000002" initial={initial} places={[]} role="editor" />);
    expect(screen.queryByRole('button', { name: 'Удалить' })).toBeNull();
    expect(screen.getByRole('link', { name: 'Предпросмотр' })).toHaveAttribute('href', '/places/muzey?preview=1');
    fireEvent.click(screen.getByRole('button', { name: 'Снять с публикации' }));
    await waitFor(() => expect(f).toHaveBeenCalledWith('/api/admin/places/5b2f2b8e-0000-4000-8000-000000000002/unpublish', expect.objectContaining({ method: 'POST' })));
    unmount();
    render(<ContentForm type="place" id="5b2f2b8e-0000-4000-8000-000000000002" initial={initial} places={[]} role="admin" />);
    expect(screen.getByRole('button', { name: 'Удалить' })).toBeInTheDocument();
  });

  it('удаление требует подтверждения', async () => {
    const f = fetchMock(200, { ok: true });
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    render(<ContentForm type="place" id="5b2f2b8e-0000-4000-8000-000000000003" initial={{ title: 'A', slug: 'a', status: 'draft', tags: [], media: [] }} places={[]} role="admin" />);
    fireEvent.click(screen.getByRole('button', { name: 'Удалить' }));
    expect(f).not.toHaveBeenCalled();
  });

  it('форма события: часовой пояс Казани и дополнительные сеансы', async () => {
    const f = fetchMock(201, { id: '5b2f2b8e-0000-4000-8000-000000000004' });
    render(<ContentForm type="event" initial={null} places={[]} role="editor" />);
    fill('Название', 'Концерт');
    fill('Начало (время Казани)', '2026-10-17T19:00');
    fireEvent.click(screen.getByRole('button', { name: 'Добавить сеанс' }));
    fireEvent.change(screen.getByLabelText('Начало сеанса'), { target: { value: '2026-10-24T19:00' } });
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить черновик' }));
    await waitFor(() => expect(f).toHaveBeenCalled());
    const body = JSON.parse(f.mock.calls[0]![1]!.body as string);
    expect(body.startsAt).toBe('2026-10-17T16:00:00.000Z');
    expect(body.occurrences[0].startsAt).toBe('2026-10-24T16:00:00.000Z');
    expect(body.status).toBe('draft');
  });
});
