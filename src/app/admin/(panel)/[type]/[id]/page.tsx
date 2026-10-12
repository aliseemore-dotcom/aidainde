import { notFound } from 'next/navigation';
import { desc } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { places } from '@/db/schema';
import { getEditable } from '@/features/catalog/admin-queries';
import { ContentForm } from '@/components/admin/ContentForm';
import { parseType } from '@/app/api/admin/_shared';
import { getAdmin } from '@/lib/auth';
import { ApiError } from '@/lib/errors';

export const dynamic = 'force-dynamic';

export default async function EditContent({ params }: { params: Promise<{ type: string; id: string }> }) {
  const { type: raw, id } = await params;
  let type;
  try { type = parseType(raw); } catch (e) { if (e instanceof ApiError) notFound(); throw e; }
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const db = await getDb();
  const data = await getEditable(db, type, id);
  if (!data) notFound();
  const admin = (await getAdmin())!;
  const list = type === 'event' ? await db.select({ id: places.id, title: places.title }).from(places).orderBy(desc(places.updatedAt)) : [];
  // Date -> строка: пропсы клиентского компонента должны быть сериализуемы
  const plain = JSON.parse(JSON.stringify(data));
  return (
    <>
      <h1 className="t-h1">{String(data.title)}</h1>
      <ContentForm type={type} id={id} initial={plain} places={list} role={admin.role} />
    </>
  );
}
