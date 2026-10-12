import { getDb } from '@/db/client';
import { deleteContent, updateContent } from '@/features/catalog/mutations';
import { getEditable } from '@/features/catalog/admin-queries';
import { requireAdmin } from '@/lib/auth';
import { ApiError, handle, readJson } from '@/lib/errors';
import { assertSameOrigin } from '@/lib/security';
import { parseType, checkMediaHosts, mapMutationError } from '../../_shared';

export const dynamic = 'force-dynamic';
type P = { params: Promise<{ type: string; id: string }> };
const uuid = (id: string) => { if (!/^[0-9a-f-]{36}$/i.test(id)) throw new ApiError('CONTENT_NOT_FOUND', 'Запись не найдена'); return id; };

export const GET = handle(async (_req: Request, { params }: P) => {
  await requireAdmin();
  const { type, id } = await params;
  const item = await getEditable(await getDb(), parseType(type), uuid(id));
  if (!item) throw new ApiError('CONTENT_NOT_FOUND', 'Запись не найдена');
  return Response.json(item, { headers: { 'cache-control': 'no-store' } });
});

export const PATCH = handle(async (req: Request, { params }: P) => {
  assertSameOrigin(req);
  const admin = await requireAdmin();
  const { type, id } = await params;
  const body = await readJson(req, 100_000);
  checkMediaHosts(body);
  try {
    const ok = await updateContent(await getDb(), parseType(type), uuid(id), body, admin.userId);
    if (!ok) throw new ApiError('CONTENT_NOT_FOUND', 'Запись не найдена');
    return Response.json({ ok: true }, { headers: { 'cache-control': 'no-store' } });
  } catch (e) {
    if (e instanceof ApiError) throw e;
    throw mapMutationError(e);
  }
});

/** Удаление — только роль admin; редактор может снять с публикации. */
export const DELETE = handle(async (req: Request, { params }: P) => {
  assertSameOrigin(req, { json: false });
  const admin = await requireAdmin({ role: 'admin' });
  const { type, id } = await params;
  const ok = await deleteContent(await getDb(), parseType(type), uuid(id), admin.userId);
  if (!ok) throw new ApiError('CONTENT_NOT_FOUND', 'Запись не найдена');
  return Response.json({ ok: true }, { headers: { 'cache-control': 'no-store' } });
});
