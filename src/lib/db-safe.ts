import 'server-only';

/** Страницы не падают целиком при сбое БД: возвращаем {ok:false} и показываем «Повторить». */
export async function safe<T>(fn: () => Promise<T>): Promise<{ ok: true; value: T } | { ok: false }> {
  try { return { ok: true, value: await fn() }; } catch (e) {
    console.error('[page] data error', e instanceof Error ? e.message : 'unknown');
    return { ok: false };
  }
}
