import { allowDraftPreview } from '@/lib/env';

export const dynamic = 'force-dynamic';

/** Режим сайта для интерфейса: показывать ли плашку предпросмотра. Не раскрывает ничего, кроме этого флага. */
export function GET() {
  return Response.json({ preview: allowDraftPreview() }, { headers: { 'cache-control': 'no-store' } });
}
