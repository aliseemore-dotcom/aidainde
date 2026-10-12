import { getDb } from '@/db/client';
import { createContent } from '@/features/catalog/mutations';
import { listAdmin } from '@/features/catalog/admin-queries';
import { requireAdmin } from '@/lib/auth';
import { ApiError, handle, readJson } from '@/lib/errors';
import { assertSameOrigin } from '@/lib/security';
import { parseType, checkMediaHosts, mapMutationError } from '../_shared';

export const dynamic = 'force-dynamic';

export const GET = handle(async (_req: Request, { params }: { params: Promise<{ type: string }> }) => {
  await requireAdmin();
  const type = parseType((await params).type);
  return Response.json({ items: await listAdmin(await getDb(), type) }, { headers: { 'cache-control': 'no-store' } });
});

export const POST = handle(async (req: Request, { params }: { params: Promise<{ type: string }> }) => {
  assertSameOrigin(req);
  const admin = await requireAdmin();
  const type = parseType((await params).type);
  const body = await readJson(req, 100_000);
  checkMediaHosts(body);
  try {
    const id = await createContent(await getDb(), type, body, admin.userId);
    return Response.json({ id }, { status: 201, headers: { 'cache-control': 'no-store' } });
  } catch (e) {
    if (e instanceof ApiError) throw e;
    throw mapMutationError(e);
  }
});
