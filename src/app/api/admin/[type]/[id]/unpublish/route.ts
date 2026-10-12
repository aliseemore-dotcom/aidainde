import { getDb } from '@/db/client';
import { unpublishContent } from '@/features/catalog/mutations';
import { requireAdmin } from '@/lib/auth';
import { ApiError, handle } from '@/lib/errors';
import { assertSameOrigin } from '@/lib/security';
import { parseType } from '../../../_shared';

export const dynamic = 'force-dynamic';

export const POST = handle(async (req: Request, { params }: { params: Promise<{ type: string; id: string }> }) => {
  assertSameOrigin(req);
  const admin = await requireAdmin();
  const { type, id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new ApiError('CONTENT_NOT_FOUND', 'Запись не найдена');
  const ok = await unpublishContent(await getDb(), parseType(type), id, admin.userId);
  if (!ok) throw new ApiError('CONTENT_NOT_FOUND', 'Запись не найдена');
  return Response.json({ ok: true }, { headers: { 'cache-control': 'no-store' } });
});
