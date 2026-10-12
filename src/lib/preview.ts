import 'server-only';
import { getDb } from '@/db/client';
import { getContentBySlug } from '@/features/catalog/queries';
import type { ContentType } from '@/features/recommend/types';
import { getAdmin } from './auth';
import { allowDemoContent } from './env';
import { safe } from './db-safe';

/**
 * Загрузка карточки для публичной страницы. С ?preview=1 и сессией редактора отдаёт и черновик
 * (с пометкой); для всех остальных ?preview=1 ничего не меняет.
 */
export function loadDetail(type: ContentType, slug: string, preview: boolean) {
  return safe(async () => {
    const admin = preview ? await getAdmin() : null;
    const detail = await getContentBySlug(await getDb(), type, slug, { allowDemo: allowDemoContent() || !!admin, includeDraft: !!admin });
    return { detail, previewing: !!admin };
  });
}
