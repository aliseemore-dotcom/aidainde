import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { LogoLink } from '@/components/ui/Logo';
import { getAdmin } from '@/lib/auth';
import { signOut } from '../actions';

export const dynamic = 'force-dynamic';

/** Единая точка защиты страниц админки: без сессии и записи в admin_users никто дальше не попадёт. */
export default async function PanelLayout({ children }: { children: ReactNode }) {
  const admin = await getAdmin();
  if (!admin) redirect('/admin/login');
  return (
    <div className="page admin">
      <header className="pagehead"><LogoLink /><span className="t-meta">{admin.email ?? 'редактор'} · {admin.role === 'admin' ? 'админ' : 'редактор'}</span></header>
      <nav className="chips admin-nav" aria-label="Разделы админки">
        <Link className="k-chip" href="/admin">Обзор</Link>
        <Link className="k-chip" href="/admin/places">Места</Link>
        <Link className="k-chip" href="/admin/events">События</Link>
        <Link className="k-chip" href="/admin/activities">Идеи на дом</Link>
        <form action={signOut}><button type="submit" className="k-chip">Выйти</button></form>
      </nav>
      <div className="stack">{children}</div>
    </div>
  );
}
