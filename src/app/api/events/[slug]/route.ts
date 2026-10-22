import { getDb } from '@/db/client';
import { getContentBySlug } from '@/features/catalog/queries';
import { publicView } from '@/features/catalog/public';
import { ApiError, handle } from '@/lib/errors';
import { contentVisibility } from '@/lib/env';
import { clientIp, rateLimit } from '@/lib/security';

export const dynamic = 'force-dynamic';

export const GET = handle(async (req: Request, { params }: { params: Promise<{ slug: string }> }) => {
  await rateLimit(`content:${clientIp(req)}`, 120, 60_000);
  const { slug } = await params;
  const v = contentVisibility();
  const d = await getContentBySlug(await getDb(), 'event', slug, { allowDemo: v.allowDemo, includeDraft: v.allowDrafts });
  if (!d) throw new ApiError('CONTENT_NOT_FOUND', 'Запись не найдена');
  return Response.json(publicView(d), { headers: { 'cache-control': 'public, s-maxage=60, stale-while-revalidate=300' } });
});
