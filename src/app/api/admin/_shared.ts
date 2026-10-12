import { ApiError } from '@/lib/errors';
import { allowedImageHosts } from '@/lib/env';
import { isAllowedImageUrl } from '@/lib/security';
import { PublishError, SlugTakenError } from '@/features/catalog/mutations';
import { ZodError } from 'zod';
import type { ContentType } from '@/features/recommend/types';

export function parseType(raw: string): ContentType {
  if (raw === 'places') return 'place';
  if (raw === 'events') return 'event';
  if (raw === 'activities') return 'activity';
  throw new ApiError('CONTENT_NOT_FOUND', 'Неизвестный раздел');
}

/** Картинки только с разрешённых https-доменов (IMAGE_HOSTS). */
export function checkMediaHosts(body: unknown): void {
  const items = (body as { media?: { url?: unknown }[] } | null)?.media;
  if (!Array.isArray(items) || !items.length) return;
  const hosts = allowedImageHosts();
  for (const m of items) {
    if (typeof m?.url !== 'string' || !isAllowedImageUrl(m.url, hosts)) {
      throw new ApiError('INVALID_CONTENT', 'Адрес изображения не входит в список разрешённых доменов', [{ field: 'media', message: String(m?.url ?? '') }]);
    }
  }
}

/** Ошибки записи каталога -> понятные ответы API; неизвестные пробрасываются дальше (станут INTERNAL_ERROR). */
export function mapMutationError(e: unknown): ApiError {
  if (e instanceof PublishError) return new ApiError('PUBLISH_REQUIREMENTS', 'Для публикации не хватает данных', e.issues);
  if (e instanceof SlugTakenError) return new ApiError('SLUG_TAKEN', 'Такой адрес (slug) уже занят');
  if (e instanceof ZodError) return new ApiError('INVALID_CONTENT', 'Проверьте поля формы', e.issues.map((i) => ({ field: i.path.map(String).join('.'), message: i.message })));
  throw e;
}
