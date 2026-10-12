import { getDb } from '@/db/client';
import { completeQuiz } from '@/features/results/service';
import { handle, readJson } from '@/lib/errors';
import { allowDemoContent, readEnv, tokenSecret } from '@/lib/env';
import { clientIp, rateLimit } from '@/lib/security';

export const dynamic = 'force-dynamic';

export const POST = handle(async (req: Request) => {
  rateLimit(`complete:${clientIp(req)}`, 20, 60_000);
  const body = await readJson(req);
  const env = readEnv();
  const out = await completeQuiz(await getDb(), body, {
    now: new Date(), allowDemo: allowDemoContent(env), secret: tokenSecret(env), logRecommendations: env.LOG_RECOMMENDATIONS === 'true',
  });
  return Response.json(out, { headers: { 'cache-control': 'no-store' } });
});
