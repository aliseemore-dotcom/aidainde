import { getDb } from '@/db/client';
import { listCatalog } from '@/features/catalog/queries';
import { catalogQuery } from '@/features/catalog/validators';
import { ApiError, handle } from '@/lib/errors';
import { allowDemoContent } from '@/lib/env';
import { clientIp, rateLimit } from '@/lib/security';

export const dynamic = 'force-dynamic';

export const GET = handle(async (req: Request) => {
  await rateLimit(`catalog:${clientIp(req)}`, 120, 60_000);
  const parsed = catalogQuery.safeParse(Object.fromEntries(new URL(req.url).searchParams));
  if (!parsed.success) throw new ApiError('INVALID_QUERY', 'Некорректные параметры запроса', parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })));
  const out = await listCatalog(await getDb(), parsed.data, { allowDemo: allowDemoContent(), now: new Date() });
  return Response.json(out, { headers: { 'cache-control': 'public, s-maxage=60, stale-while-revalidate=300' } });
});
