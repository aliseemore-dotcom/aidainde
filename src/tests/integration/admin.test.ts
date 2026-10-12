import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryDb, type Db } from '@/db/client';
import { seedTags } from '@/features/catalog/mutations';
import { ApiError } from '@/lib/errors';

let db: Db;
let current: { userId: string; email: string; role: 'editor' | 'admin' } | null = null;

vi.mock('@/db/client', async (orig) => ({ ...(await orig<typeof import('@/db/client')>()), getDb: async () => db }));
vi.mock('@/lib/auth', () => ({
  getAdmin: async () => current,
  requireAdmin: async (opts: { role?: 'admin' } = {}) => {
    if (!current) throw new ApiError('UNAUTHORIZED', 'Нужен вход в админку');
    if (opts.role === 'admin' && current.role !== 'admin') throw new ApiError('FORBIDDEN', 'Недостаточно прав для этого действия');
    return current;
  },
}));

const EDITOR = { userId: '22222222-2222-2222-2222-222222222222', email: 'e@example.com', role: 'editor' as const };
const ADMIN = { userId: '33333333-3333-3333-3333-333333333333', email: 'a@example.com', role: 'admin' as const };
const place = (o: Record<string, unknown> = {}) => ({
  slug: 'adm-place', title: 'Место из админки', description: 'Описание места из админки для проверки.', address: 'Адрес 9',
  sourceUrl: 'https://example.com/p', status: 'draft', tags: ['walks'], isDemo: true, ...o,
});
const json = (method: string, url: string, body?: unknown, headers: Record<string, string> = {}) =>
  new Request(`http://localhost${url}`, { method, headers: { host: 'localhost', origin: 'http://localhost', ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...headers }, body: body !== undefined ? JSON.stringify(body) : undefined });
const P = ((type: string, id?: string) => ({ params: Promise.resolve(id ? { type, id } : { type }) })) as {
  (type: string): { params: Promise<{ type: string }> };
  (type: string, id: string): { params: Promise<{ type: string; id: string }> };
};

beforeAll(async () => { db = await createMemoryDb(); await seedTags(db); });
beforeEach(() => { current = null; delete process.env.IMAGE_HOSTS; });
afterAll(() => { delete process.env.ALLOW_DEMO_CONTENT; });

describe('доступ к админ-API', () => {
  it('аноним не может ни читать, ни писать (401), черновики не отдаются', async () => {
    const { GET, POST } = await import('@/app/api/admin/[type]/route');
    const g = await GET(json('GET', '/api/admin/places'), P('places'));
    expect(g.status).toBe(401);
    expect((await g.json()).error.code).toBe('UNAUTHORIZED');
    expect((await POST(json('POST', '/api/admin/places', place()), P('places'))).status).toBe(401);
    const { GET: ONE } = await import('@/app/api/admin/[type]/[id]/route');
    expect((await ONE(json('GET', '/api/admin/places/x'), P('places', '44444444-4444-4444-4444-444444444444'))).status).toBe(401);
  });

  it('запрос с чужого сайта и не-JSON отклоняются даже для редактора (CSRF)', async () => {
    current = EDITOR;
    const { POST } = await import('@/app/api/admin/[type]/route');
    const evil = await POST(json('POST', '/api/admin/places', place(), { origin: 'https://evil.example' }), P('places'));
    expect(evil.status).toBe(403);
    const form = new Request('http://localhost/api/admin/places', { method: 'POST', headers: { host: 'localhost', origin: 'http://localhost', 'content-type': 'text/plain' }, body: JSON.stringify(place()) });
    expect((await POST(form, P('places'))).status).toBe(422);
  });

  it('неизвестный раздел и кривой id -> 404 в едином формате', async () => {
    current = EDITOR;
    const { GET } = await import('@/app/api/admin/[type]/route');
    expect((await GET(json('GET', '/api/admin/users'), P('users'))).status).toBe(404);
    const { GET: ONE } = await import('@/app/api/admin/[type]/[id]/route');
    const r = await ONE(json('GET', '/x'), P('places', "1'; DROP TABLE places;--"));
    expect(r.status).toBe(404);
    expect((await r.json()).error.code).toBe('CONTENT_NOT_FOUND');
  });
});

describe('работа редактора', () => {
  it('создаёт черновик, публикует, снимает; публичный API видит только опубликованное', async () => {
    process.env.ALLOW_DEMO_CONTENT = 'true';
    current = EDITOR;
    const { POST } = await import('@/app/api/admin/[type]/route');
    const { PATCH, GET: ONE } = await import('@/app/api/admin/[type]/[id]/route');
    const { POST: UNPUB } = await import('@/app/api/admin/[type]/[id]/unpublish/route');
    const { GET: PUBLIC } = await import('@/app/api/places/[slug]/route');
    const pub = async () => (await PUBLIC(new Request('http://localhost/api/places/adm-place'), { params: Promise.resolve({ slug: 'adm-place' }) })).status;

    const created = await POST(json('POST', '/api/admin/places', place()), P('places'));
    expect(created.status).toBe(201);
    const { id } = await created.json();
    expect(await pub()).toBe(404); // черновик
    const edit = await (await ONE(json('GET', '/x'), P('places', id))).json();
    expect(edit.title).toBe('Место из админки');
    expect(edit.tags).toEqual(['walks']);

    expect((await PATCH(json('PATCH', '/x', place({ status: 'published' })), P('places', id))).status).toBe(200);
    expect(await pub()).toBe(200);
    expect((await UNPUB(json('POST', '/x', {}), P('places', id))).status).toBe(200);
    expect(await pub()).toBe(404);
  });

  it('публикация без обязательных данных -> 422 с перечнем проблем', async () => {
    current = EDITOR;
    const { POST } = await import('@/app/api/admin/[type]/route');
    const res = await POST(json('POST', '/api/admin/events', {
      slug: 'adm-ev', title: 'Событие из админки', description: 'Описание события из админки для проверки.', status: 'published',
      startsAt: '2026-11-01T16:00:00Z', sourceUrl: 'https://example.com/e', tags: ['culture'],
    }), P('events'));
    expect(res.status).toBe(422);
    const j = await res.json();
    expect(j.error.code).toBe('PUBLISH_REQUIREMENTS');
    expect(j.error.details).toEqual([expect.objectContaining({ field: 'verifiedAt' })]);
  });

  it('невалидные поля -> 422 со списком; повторный slug -> 409', async () => {
    current = EDITOR;
    const { POST } = await import('@/app/api/admin/[type]/route');
    const bad = await POST(json('POST', '/api/admin/places', place({ slug: 'Bad Slug', sourceUrl: 'ftp://x', priceMin: -1 })), P('places'));
    expect(bad.status).toBe(422);
    expect((await bad.json()).error.details.length).toBeGreaterThanOrEqual(2);
    expect((await POST(json('POST', '/api/admin/places', place({ slug: 'dup-1' })), P('places'))).status).toBe(201);
    const dup = await POST(json('POST', '/api/admin/places', place({ slug: 'dup-1' })), P('places'));
    expect(dup.status).toBe(409);
    expect((await dup.json()).error.code).toBe('SLUG_TAKEN');
  });

  it('картинки: только https и только разрешённые домены', async () => {
    current = EDITOR;
    const { POST } = await import('@/app/api/admin/[type]/route');
    const withMedia = (url: string) => place({ slug: `m-${Math.random().toString(36).slice(2, 8)}`, media: [{ url, alt: 'Фасад здания', rightsStatus: 'owned' }] });
    expect((await POST(json('POST', '/api/admin/places', withMedia('https://img.good.example/a.jpg')), P('places'))).status).toBe(422); // список пуст
    process.env.IMAGE_HOSTS = 'img.good.example';
    expect((await POST(json('POST', '/api/admin/places', withMedia('https://img.good.example/a.jpg')), P('places'))).status).toBe(201);
    expect((await POST(json('POST', '/api/admin/places', withMedia('https://evil.example/a.jpg')), P('places'))).status).toBe(422);
    expect((await POST(json('POST', '/api/admin/places', withMedia('http://img.good.example/a.jpg')), P('places'))).status).toBe(422);
    expect((await POST(json('POST', '/api/admin/places', withMedia('javascript:alert(1)')), P('places'))).status).toBe(422);
  });

  it('слишком большой запрос отклоняется', async () => {
    current = EDITOR;
    const { POST } = await import('@/app/api/admin/[type]/route');
    const res = await POST(json('POST', '/api/admin/places', place({ description: 'x'.repeat(200_000) })), P('places'));
    expect(res.status).toBe(400);
  });
});

describe('роли', () => {
  it('удалять может только admin; редактор получает 403', async () => {
    const { POST } = await import('@/app/api/admin/[type]/route');
    const { DELETE } = await import('@/app/api/admin/[type]/[id]/route');
    current = EDITOR;
    const { id } = await (await POST(json('POST', '/api/admin/places', place({ slug: 'to-delete' })), P('places'))).json();
    const del = () => DELETE(new Request('http://localhost/x', { method: 'DELETE', headers: { host: 'localhost', origin: 'http://localhost' } }), P('places', id));
    expect((await del()).status).toBe(403);
    current = ADMIN;
    expect((await del()).status).toBe(200);
    expect((await del()).status).toBe(404);
  });
});
