import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getDb } from '@/db/client';
import { listAdmin } from '@/features/catalog/admin-queries';
import { STATUS_LABEL } from '@/components/admin/fields';
import { ButtonLink } from '@/components/ui/Button';
import { parseType } from '@/app/api/admin/_shared';
import { ApiError } from '@/lib/errors';

export const dynamic = 'force-dynamic';
const TITLE = { places: 'Места', events: 'События', activities: 'Идеи на дом' } as const;

export default async function AdminList({ params }: { params: Promise<{ type: string }> }) {
  const { type: raw } = await params;
  let type;
  try { type = parseType(raw); } catch (e) { if (e instanceof ApiError) notFound(); throw e; }
  const items = await listAdmin(await getDb(), type);
  return (
    <>
      <div className="section__head"><h1 className="t-h1">{TITLE[raw as keyof typeof TITLE]}</h1><ButtonLink href={`/admin/${raw}/new`} arrow>Добавить</ButtonLink></div>
      {items.length === 0 ? <p className="t-body">Пока пусто. Добавьте первую запись: только проверенные данные.</p> : (
        <ul className="occ">
          {items.map((i) => (
            <li key={i.id}>
              <Link href={`/admin/${raw}/${i.id}`}>{i.title}</Link>
              <span className="admin-meta">{i.isDemo && <span className="k-tag k-tag--danger">демо</span>}<span className={`k-tag${i.status === 'published' ? '' : ' k-tag--warm'}`}>{STATUS_LABEL[i.status] ?? i.status}</span></span>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
