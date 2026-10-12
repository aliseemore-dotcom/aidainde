import { getDb } from '@/db/client';
import { getResults } from '@/features/results/service';
import { handle } from '@/lib/errors';
import { allowDemoContent, readEnv, tokenSecret } from '@/lib/env';
import { clientIp, rateLimit } from '@/lib/security';

export const dynamic = 'force-dynamic';

export const GET = handle(async (req: Request, { params }: { params: Promise<{ token: string }> }) => {
  rateLimit(`results:${clientIp(req)}`, 60, 60_000);
  const { token } = await params;
  const env = readEnv();
  const out = await getResults(await getDb(), token, { now: new Date(), allowDemo: allowDemoContent(env), secret: tokenSecret(env) });
  return Response.json(out, { headers: { 'cache-control': 'private, no-store' } });
});
