import { notFound } from 'next/navigation';
import { desc } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { places } from '@/db/schema';
import { ContentForm } from '@/components/admin/ContentForm';
import { parseType } from '@/app/api/admin/_shared';
import { getAdmin } from '@/lib/auth';
import { ApiError } from '@/lib/errors';

export const dynamic = 'force-dynamic';

export default async function NewContent({ params }: { params: Promise<{ type: string }> }) {
  const { type: raw } = await params;
  let type;
  try { type = parseType(raw); } catch (e) { if (e instanceof ApiError) notFound(); throw e; }
  const admin = (await getAdmin())!;
  const list = type === 'event' ? await (await getDb()).select({ id: places.id, title: places.title }).from(places).orderBy(desc(places.updatedAt)) : [];
  return (
    <>
      <h1 className="t-h1">Новая запись</h1>
      <ContentForm type={type} initial={null} places={list} role={admin.role} />
    </>
  );
}
