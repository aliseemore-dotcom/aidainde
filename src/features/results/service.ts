import { eq } from 'drizzle-orm';
import { z } from 'zod';
import type { Db } from '@/db/client';
import { quizSessions, recommendationLogs } from '@/db/schema';
import { loadCandidates } from '@/features/catalog/queries';
import { recommend } from '@/features/recommend/engine';
import type { FinalAnswers, RecommendationResult, WeatherInfo } from '@/features/recommend/types';
import { finalizeAnswers } from '@/features/quiz/graph';
import { validateComplete } from '@/features/quiz/schema';
import { QUIZ_SCHEMA_VERSION, QUIZ_TYPE_MAIN, type QuizAnswers } from '@/features/quiz/types';
import { ApiError } from '@/lib/errors';
import { hashToken, looksLikeToken, newToken } from '@/lib/security';
import { recordMetrics } from './metrics';
import { isPastDate, resolveDayChoice, todayKazan, type DateRange } from '@/lib/date-kazan';

export const SESSION_TTL_DAYS = 30;

const envelope = z.object({ schemaVersion: z.number().int(), quizType: z.string(), answers: z.unknown() });

export interface Ctx {
  now: Date; allowDemo: boolean; allowDrafts?: boolean; secret: string; logRecommendations?: boolean;
  /** прогноз на даты; не задан или вернул null — работаем без погоды */
  weather?: (range: DateRange) => Promise<WeatherInfo | null>;
}

export interface ResultsPayload extends RecommendationResult {
  range: DateRange;
  /** true, если выбранная дата уже прошла (для старых ссылок) */
  dateExpired: boolean;
  answers: Pick<FinalAnswers, 'companion' | 'dayChoice' | 'budgetTier' | 'setting'> & { direction?: string };
  /** полные ответы владельцу токена — чтобы «Изменить» открывал тест с прежними ответами (в URL не попадают) */
  quizAnswers: QuizAnswers;
}

async function compute(db: Db, a: FinalAnswers, range: DateRange, ctx: Ctx): Promise<RecommendationResult> {
  const [candidates, weather] = await Promise.all([
    loadCandidates(db, { allowDemo: ctx.allowDemo, allowDrafts: ctx.allowDrafts }),
    // сбой источника погоды никогда не ломает подборку
    ctx.weather ? ctx.weather(range).catch(() => null) : Promise.resolve(null),
  ]);
  return recommend({ answers: a, range, now: ctx.now, candidates, allowDemo: ctx.allowDemo, allowDrafts: ctx.allowDrafts, ...(weather ? { weather } : {}) });
}

function summarize(a: FinalAnswers): ResultsPayload['answers'] {
  return { companion: a.companion, dayChoice: a.dayChoice, budgetTier: a.budgetTier, setting: a.setting, ...(a.direction ? { direction: a.direction } : {}) };
}

/** POST /api/quiz/complete */
export async function completeQuiz(db: Db, body: unknown, ctx: Ctx) {
  const env = envelope.safeParse(body);
  if (!env.success) throw new ApiError('INVALID_ANSWER', 'Некорректный формат запроса');
  if (env.data.schemaVersion !== QUIZ_SCHEMA_VERSION) throw new ApiError('STALE_QUIZ_VERSION', 'Тест обновился. Пройдите его заново.');
  // /date — отдельная схема; ответы разных тестов не смешиваются
  if (env.data.quizType !== QUIZ_TYPE_MAIN) throw new ApiError('INVALID_ANSWER', 'Неизвестный тип теста');

  const v = validateComplete(env.data.answers);
  if (!v.ok) throw new ApiError('INVALID_ANSWER', 'Ответы неполные или противоречивы', v.issues);
  if (v.answers.dayChoice === 'date' && isPastDate(v.answers.targetDate!, ctx.now)) {
    throw new ApiError('INVALID_ANSWER', 'Дата уже прошла', [{ code: 'INVALID_ANSWER', stepId: 'COMMON.DATE_PICKER', message: 'Дата не может быть в прошлом' }]);
  }

  const answers = finalizeAnswers(v.answers) as unknown as FinalAnswers;
  const range = resolveDayChoice(answers.dayChoice, ctx.now, answers.targetDate); // дата — по Казани, на сервере
  const result = await compute(db, answers, range, ctx);

  const token = newToken();
  const [session] = await db.insert(quizSessions).values({
    publicTokenHash: hashToken(token, ctx.secret), schemaVersion: QUIZ_SCHEMA_VERSION, quizType: QUIZ_TYPE_MAIN,
    answersJson: v.answers, resolvedRangeJson: range, expiresAt: new Date(ctx.now.getTime() + SESSION_TTL_DAYS * 86_400_000),
  }).returning({ id: quizSessions.id });

  if (ctx.logRecommendations && result.items.length) {
    await db.insert(recommendationLogs).values(result.items.map((i) => ({
      sessionId: session!.id, contentType: i.type, contentId: i.id, score: i.score, reasonCodes: i.reasonCodes,
    })));
  }

  await recordMetrics(db, [
    'quiz_completed', result.empty ? 'results_empty' : 'results_ok',
    `setting:${answers.setting}`, `companion:${answers.companion}`, ...(answers.direction ? [`direction:${answers.direction}`] : []),
  ], ctx.now);

  return {
    sessionToken: token,
    results: result.items,
    relaxedFilters: result.relaxed,
    reasons: Object.fromEntries(result.items.map((i) => [i.id, i.reasons])),
    empty: result.empty,
    weather: result.weather ?? null,
    indoorAlternatives: result.indoorAlternatives ?? [],
  };
}

/** GET /api/results/:token — пересчитывает по актуальному каталогу, дата берётся из сохранённой сессии. */
export async function getResults(db: Db, token: string, ctx: Ctx): Promise<ResultsPayload> {
  // неверный формат токена неотличим от несуществующего: не раскрываем причину
  if (!looksLikeToken(token)) throw new ApiError('CONTENT_NOT_FOUND', 'Ссылка недействительна или устарела');
  const [s] = await db.select().from(quizSessions).where(eq(quizSessions.publicTokenHash, hashToken(token, ctx.secret))).limit(1);
  if (!s || s.expiresAt < ctx.now) throw new ApiError('CONTENT_NOT_FOUND', 'Ссылка недействительна или устарела');

  const v = validateComplete(s.answersJson);
  if (!v.ok) throw new ApiError('STALE_QUIZ_VERSION', 'Тест обновился. Пройдите его заново.');
  const answers = finalizeAnswers(v.answers) as unknown as FinalAnswers;
  const range = s.resolvedRangeJson;
  const result = await compute(db, answers, range, ctx);
  return { ...result, range, dateExpired: range.to < todayKazan(ctx.now), answers: summarize(answers), quizAnswers: v.answers };
}

export type { QuizAnswers };
