import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryDb, type Db } from '@/db/client';
import { seedDemo } from '@/db/seed-demo';
import { createContent, seedTags } from '@/features/catalog/mutations';
import { quizSessions } from '@/db/schema';
import { completeQuiz, getResults, SESSION_TTL_DAYS, type Ctx } from '@/features/results/service';
import { ApiError } from '@/lib/errors';
import { resetRateLimits } from '@/lib/security';

const NOW = new Date('2026-10-12T09:00:00Z'); // пн, Казань
const ctx: Ctx = { now: NOW, allowDemo: true, secret: 'test-secret-test-secret' };
let db: Db;
let failDb = false;

vi.mock('@/db/client', async (orig) => {
  const real = await orig<typeof import('@/db/client')>();
  return { ...real, getDb: async () => { if (failDb) throw new Error('boom: secret connection string postgres://u:p@h/db'); return db; } };
});

const answers = {
  socialEnergy: 'high', companion: 'group', mood: 'excitement', setting: 'indoor', direction: 'games',
  branchAnswers: { G1: 'mind', G2_MIND: 'quiz', G3: 'friendly' }, dayChoice: 'weekend', budgetTier: 'mid', budgetBasis: 'per_person', partySize: 6,
};
const body = (a: unknown = answers, over: Record<string, unknown> = {}) => ({ schemaVersion: 1, quizType: 'main', answers: a, ...over });
const code = async (p: Promise<unknown>) => { try { await p; return 'OK'; } catch (e) { return e instanceof ApiError ? e.code : `THROWN:${String(e)}`; } };

beforeAll(async () => {
  db = await createMemoryDb();
  await seedTags(db);
  await seedDemo(db, NOW);
});
beforeEach(() => { resetRateLimits(); failDb = false; });

describe('сервис результатов', () => {
  it('выдаёт подборку и токен; токен в БД хранится только хэшем', async () => {
    const out = await completeQuiz(db, body(), ctx);
    expect(out.sessionToken).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect(out.results.length).toBeGreaterThan(0);
    expect(out.reasons[out.results[0]!.id]).toEqual(out.results[0]!.reasons);
    const rows = await db.select().from(quizSessions);
    expect(rows.some((r) => r.publicTokenHash === out.sessionToken)).toBe(false);
    expect(JSON.stringify(rows)).not.toContain(out.sessionToken);
  });

  it('восстанавливает результаты по токену; незнакомый токен и мусор неотличимы', async () => {
    const out = await completeQuiz(db, body(), ctx);
    const back = await getResults(db, out.sessionToken, ctx);
    expect(back.items.map((i) => i.id)).toEqual(out.results.map((i) => i.id));
    expect(back.dateExpired).toBe(false);
    expect(await code(getResults(db, 'A'.repeat(32), ctx))).toBe('CONTENT_NOT_FOUND');
    expect(await code(getResults(db, 'короткий', ctx))).toBe('CONTENT_NOT_FOUND');
    expect(await code(getResults(db, "' OR 1=1 --", ctx))).toBe('CONTENT_NOT_FOUND');
  });

  it('сессия живёт 30 дней, затем «истёкшая сессия»', async () => {
    const out = await completeQuiz(db, body(), ctx);
    const almost = new Date(NOW.getTime() + (SESSION_TTL_DAYS * 86_400_000 - 1000));
    await expect(getResults(db, out.sessionToken, { ...ctx, now: almost })).resolves.toBeTruthy();
    const after = new Date(NOW.getTime() + (SESSION_TTL_DAYS * 86_400_000 + 1000));
    expect(await code(getResults(db, out.sessionToken, { ...ctx, now: after }))).toBe('CONTENT_NOT_FOUND');
  });

  it('«сегодня» фиксируется в момент выдачи: через неделю ссылка помечена как устаревшая по дате', async () => {
    const out = await completeQuiz(db, body({ ...answers, dayChoice: 'today' }), ctx);
    const later = new Date('2026-10-19T09:00:00Z');
    const back = await getResults(db, out.sessionToken, { ...ctx, now: later });
    expect(back.range).toEqual({ from: '2026-10-12', to: '2026-10-12' });
    expect(back.dateExpired).toBe(true);
  });

  it('дата считается по Казани на сервере, а не по часам клиента', async () => {
    const lateEvening = { ...ctx, now: new Date('2026-10-12T21:30:00Z') }; // 00:30 MSK, уже вторник
    const out = await completeQuiz(db, body({ ...answers, dayChoice: 'today' }), lateEvening);
    const back = await getResults(db, out.sessionToken, lateEvening);
    expect(back.range.from).toBe('2026-10-13');
  });

  it('отклоняет устаревшую версию, чужой тип теста, неполные, лишние и невалидные ответы', async () => {
    expect(await code(completeQuiz(db, body(answers, { schemaVersion: 0 }), ctx))).toBe('STALE_QUIZ_VERSION');
    expect(await code(completeQuiz(db, body(answers, { quizType: 'date' }), ctx))).toBe('INVALID_ANSWER');
    expect(await code(completeQuiz(db, body({ socialEnergy: 'high' }), ctx))).toBe('INVALID_ANSWER');
    expect(await code(completeQuiz(db, body({ ...answers, mood: 'angry' }), ctx))).toBe('INVALID_ANSWER');
    expect(await code(completeQuiz(db, body({ ...answers, direction: 'wellness' }), ctx))).toBe('INVALID_ANSWER'); // противоречит веткам
    expect(await code(completeQuiz(db, body({ ...answers, role: 'admin' }), ctx))).toBe('INVALID_ANSWER');
    expect(await code(completeQuiz(db, 'text', ctx))).toBe('INVALID_ANSWER');
    expect(await code(completeQuiz(db, null, ctx))).toBe('INVALID_ANSWER');
    expect(await code(completeQuiz(db, body({ ...answers, partySize: 2 }), ctx))).toBe('INVALID_ANSWER'); // группа от 3
  });

  it('прошедшая дата отклоняется по времени Казани', async () => {
    const a = { ...answers, dayChoice: 'date' };
    expect(await code(completeQuiz(db, body({ ...a, targetDate: '2026-10-11' }), ctx))).toBe('INVALID_ANSWER');
    expect(await code(completeQuiz(db, body({ ...a, targetDate: '2026-10-12' }), ctx))).toBe('OK');
    // 00:30 MSK вторника: «12 октября» уже прошло
    expect(await code(completeQuiz(db, body({ ...a, targetDate: '2026-10-12' }), { ...ctx, now: new Date('2026-10-12T21:30:00Z') }))).toBe('INVALID_ANSWER');
  });

  it('погода: сбой источника не ломает подборку; прогноз попадает в ответ и в результаты по токену', async () => {
    const outdoor = { ...answers, setting: 'any', direction: 'walks', branchAnswers: { W1: 'scenic', W2: 'near' }, budgetTier: 'any', companion: 'solo', socialEnergy: 'low', mood: 'relax' } as Record<string, unknown>;
    delete outdoor.partySize; delete outdoor.budgetBasis;
    const boom = await completeQuiz(db, body(outdoor), { ...ctx, weather: async () => { throw new Error('api down'); } });
    expect(boom.weather).toBeNull();
    expect(boom.results.length).toBeGreaterThan(0);
    const none = await completeQuiz(db, body(outdoor), { ...ctx, weather: async () => null });
    expect(none.weather).toBeNull();
    const bad = { risk: 'dangerous' as const, summary: 'ожидается гроза', source: 'open-meteo', fetchedAt: NOW.toISOString() };
    const out = await completeQuiz(db, body(outdoor), { ...ctx, weather: async () => bad });
    expect(out.weather).toEqual(bad);
    const back = await getResults(db, out.sessionToken, { ...ctx, weather: async () => bad });
    expect(back.weather?.risk).toBe('dangerous');
    expect(back.items.length).toBeGreaterThan(0);
  });

  it('пустой каталог — успешный ответ с пустым списком, а не ошибка', async () => {
    const empty = await createMemoryDb();
    const out = await completeQuiz(empty, body(), ctx);
    expect(out.results).toEqual([]);
    expect(out.empty).toBe(true);
  });

  it('в production demo-записи не попадают в подборку', async () => {
    const out = await completeQuiz(db, body(), { ...ctx, allowDemo: false });
    expect(out.results).toEqual([]);
  });

  it('правка каталога отражается при следующем открытии ссылки', async () => {
    const out = await completeQuiz(db, body(), ctx);
    const before = (await getResults(db, out.sessionToken, ctx)).items.length;
    await createContent(db, 'place', {
      slug: 'new-quiz', title: 'Новый квиз', description: 'Описание нового квиза для проверки пересчёта.', address: 'Адрес 5',
      sourceUrl: 'https://example.com/n', status: 'published', isDemo: true, priceMin: 200, priceMax: 200, priceUnit: 'per_person',
      indoorOutdoor: 'indoor', minParticipants: 2, maxParticipants: 20,
      tags: ['games', 'game_mind', 'game_quiz', 'comp_friendly', 'mood_excitement', 'company_group', 'energy_high'],
    }, '11111111-1111-1111-1111-111111111111');
    const after = await getResults(db, out.sessionToken, ctx);
    expect(after.items.length).toBeGreaterThanOrEqual(before);
    expect(after.items[0]!.title).toBe('Новый квиз');
  });
});

describe('HTTP-обработчики', () => {
  beforeAll(() => { process.env.ALLOW_DEMO_CONTENT = 'true'; });
  afterAll(() => { delete process.env.ALLOW_DEMO_CONTENT; });
  const req = (url: string, init?: RequestInit) => new Request(`http://localhost${url}`, init);
  const post = (b: unknown, headers: Record<string, string> = {}) =>
    req('/api/quiz/complete', { method: 'POST', body: typeof b === 'string' ? b : JSON.stringify(b), headers });

  it('невалидный JSON -> 400 в едином конверте, без stack trace', async () => {
    const { POST } = await import('@/app/api/quiz/complete/route');
    const res = await POST(post('{not json'));
    expect(res.status).toBe(400);
    const j = await res.json();
    expect(j).toEqual({ error: { code: 'INVALID_ANSWER', message: expect.any(String) } });
    expect(JSON.stringify(j)).not.toMatch(/stack|at \w+ \(|node_modules/);
  });

  it('успешный POST возвращает токен и результаты; ответ не кэшируется', async () => {
    const { POST } = await import('@/app/api/quiz/complete/route');
    const res = await POST(post(body()));
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    const j = await res.json();
    expect(j.sessionToken).toBeTruthy();
    expect(Array.isArray(j.results)).toBe(true);
    expect(j.results.length).toBeGreaterThan(0);
  });

  it('без ALLOW_DEMO_CONTENT (production) публичные ручки не видят demo', async () => {
    const { GET } = await import('@/app/api/places/[slug]/route');
    const { GET: CAT } = await import('@/app/api/catalog/route');
    delete process.env.ALLOW_DEMO_CONTENT;
    try {
      expect((await GET(req('/api/places/demo-muzey'), { params: Promise.resolve({ slug: 'demo-muzey' }) })).status).toBe(404);
      expect((await (await CAT(req('/api/catalog?type=place'))).json()).total).toBe(0);
    } finally { process.env.ALLOW_DEMO_CONTENT = 'true'; }
  });

  it('лимит запросов -> 429 с Retry-After', async () => {
    const { POST } = await import('@/app/api/quiz/complete/route');
    const h = { 'x-forwarded-for': '203.0.113.7' };
    let last: Response | undefined;
    for (let i = 0; i < 21; i++) last = await POST(post('{}', h));
    expect(last!.status).toBe(429);
    expect(last!.headers.get('retry-after')).toBeTruthy();
    expect((await last!.json()).error.code).toBe('RATE_LIMITED');
    const other = await POST(post('{}', { 'x-forwarded-for': '203.0.113.8' }));
    expect(other.status).toBe(400); // другой клиент не затронут
  });

  it('внутренняя ошибка не раскрывает детали', async () => {
    const { POST } = await import('@/app/api/quiz/complete/route');
    failDb = true;
    const res = await POST(post(body()));
    expect(res.status).toBe(500);
    const text = await res.text();
    expect(text).not.toContain('postgres://');
    expect(text).not.toContain('boom');
    expect(JSON.parse(text).error.code).toBe('INTERNAL_ERROR');
  });

  it('GET /api/results/:token: чужой токен -> 404, свой -> 200', async () => {
    const { POST } = await import('@/app/api/quiz/complete/route');
    const { GET } = await import('@/app/api/results/[token]/route');
    const { sessionToken } = await (await POST(post(body()))).json();
    const ok = await GET(req(`/api/results/${sessionToken}`), { params: Promise.resolve({ token: sessionToken }) });
    expect(ok.status).toBe(200);
    expect(ok.headers.get('cache-control')).toContain('no-store');
    const bad = await GET(req('/api/results/x'), { params: Promise.resolve({ token: 'x' }) });
    expect(bad.status).toBe(404);
    expect((await bad.json()).error.code).toBe('CONTENT_NOT_FOUND');
  });

  it('GET /api/catalog: валидация запроса и пагинация', async () => {
    const { GET } = await import('@/app/api/catalog/route');
    expect((await GET(req('/api/catalog?type=hack'))).status).toBe(400);
    expect((await GET(req('/api/catalog?pageSize=1000'))).status).toBe(400);
    const ok = await GET(req('/api/catalog?type=place&pageSize=3'));
    expect(ok.status).toBe(200);
    const j = await ok.json();
    expect(j.items.length).toBeLessThanOrEqual(3);
    expect(j.total).toBeGreaterThan(0);
  });

  it('GET /api/places/:slug: публичные поля без служебных; черновик -> 404', async () => {
    const { GET } = await import('@/app/api/places/[slug]/route');
    await createContent(db, 'place', {
      slug: 'secret-draft', title: 'Черновик места', description: 'Описание черновика для проверки доступа.', address: 'Адрес 7',
      sourceUrl: 'https://example.com/d', status: 'draft', isDemo: true, tags: ['walks'],
    }, '11111111-1111-1111-1111-111111111111');
    const draft = await GET(req('/api/places/secret-draft'), { params: Promise.resolve({ slug: 'secret-draft' }) });
    expect(draft.status).toBe(404);
    const ok = await GET(req('/api/places/demo-muzey'), { params: Promise.resolve({ slug: 'demo-muzey' }) });
    expect(ok.status).toBe(200);
    const j = await ok.json();
    expect(j.title).toContain('музей');
    expect(j).not.toHaveProperty('id');
    expect(j).not.toHaveProperty('createdAt');
    expect(j).not.toHaveProperty('updatedAt');
    const missing = await GET(req('/api/places/nope'), { params: Promise.resolve({ slug: 'nope' }) });
    expect((await missing.json()).error.code).toBe('CONTENT_NOT_FOUND');
  });
});
