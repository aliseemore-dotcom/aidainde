/** Единый конверт ошибок API: { error: { code, message, details? } }. Без внутренних ключей и stack trace. */
export type ErrorCode =
  | 'INVALID_ANSWER' | 'STALE_QUIZ_VERSION' | 'CONTENT_NOT_FOUND' | 'NO_RESULTS' | 'RATE_LIMITED' | 'UNAUTHORIZED'
  | 'FORBIDDEN' | 'INVALID_QUERY' | 'INVALID_CONTENT' | 'PUBLISH_REQUIREMENTS' | 'SLUG_TAKEN' | 'INTERNAL_ERROR';

const STATUS: Record<ErrorCode, number> = {
  INVALID_ANSWER: 400, STALE_QUIZ_VERSION: 409, CONTENT_NOT_FOUND: 404, NO_RESULTS: 200, RATE_LIMITED: 429,
  UNAUTHORIZED: 401, FORBIDDEN: 403, INVALID_QUERY: 400, INVALID_CONTENT: 422, PUBLISH_REQUIREMENTS: 422,
  SLUG_TAKEN: 409, INTERNAL_ERROR: 500,
};

export class ApiError extends Error {
  constructor(public code: ErrorCode, message: string, public details?: unknown, public headers?: Record<string, string>) {
    super(message);
  }
  get status() { return STATUS[this.code]; }
}

export function errorResponse(e: ApiError): Response {
  return Response.json(
    { error: { code: e.code, message: e.message, ...(e.details !== undefined ? { details: e.details } : {}) } },
    { status: e.status, headers: { 'cache-control': 'no-store', ...(e.headers ?? {}) } },
  );
}

/** Оборачивает обработчик: ApiError -> конверт, всё остальное -> общий INTERNAL_ERROR (детали только в серверный лог). */
export function handle<A extends unknown[]>(fn: (...args: A) => Promise<Response>) {
  return async (...args: A): Promise<Response> => {
    try {
      return await fn(...args);
    } catch (e) {
      if (e instanceof ApiError) return errorResponse(e);
      console.error('[api] unhandled error', e instanceof Error ? e.message : 'unknown');
      return errorResponse(new ApiError('INTERNAL_ERROR', 'Что-то пошло не так. Попробуйте ещё раз.'));
    }
  };
}

/** Читает JSON-тело с ограничением размера; иначе INVALID_ANSWER. */
export async function readJson(req: Request, maxBytes = 20_000): Promise<unknown> {
  const text = await req.text();
  if (text.length > maxBytes) throw new ApiError('INVALID_ANSWER', 'Слишком большой запрос');
  try { return JSON.parse(text); } catch { throw new ApiError('INVALID_ANSWER', 'Тело запроса не является корректным JSON'); }
}
