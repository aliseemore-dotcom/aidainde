import 'server-only';
import { eq } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { adminUsers } from '@/db/schema';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { ApiError } from './errors';
import { isProductionDeploy } from './env';
import { supabaseConfigured, supabaseServer } from './supabase/server';

export interface AdminSession { userId: string; email: string | null; role: 'editor' | 'admin' }

/**
 * Текущий редактор или null. getUser() проверяет токен на стороне Supabase (а не просто читает куку),
 * затем права сверяются с нашей таблицей admin_users. Нет настройки Supabase — админки нет вообще.
 */
/**
 * Тестовый вход для E2E: роль берётся из куки `e2e_admin`. Включается ТОЛЬКО флагом E2E_AUTH=1
 * и никогда на боевом деплое: при совпадении флага с production приложение отказывается работать.
 */
export function e2eAuthEnabled(): boolean {
  if (process.env.E2E_AUTH !== '1') return false;
  if (isProductionDeploy()) throw new Error('E2E_AUTH нельзя включать на production');
  return true;
}

export async function getAdmin(): Promise<AdminSession | null> {
  if (e2eAuthEnabled()) {
    const role = (await cookies()).get('e2e_admin')?.value;
    if (role !== 'editor' && role !== 'admin') return null;
    return { userId: role === 'admin' ? '00000000-0000-4000-8000-0000000000a1' : '00000000-0000-4000-8000-0000000000e1', email: `${role}@e2e.local`, role };
  }
  if (!supabaseConfigured()) return null;
  try {
    const supabase = await supabaseServer();
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) return null;
    const [row] = await (await getDb()).select().from(adminUsers).where(eq(adminUsers.userId, data.user.id)).limit(1);
    return row ? { userId: row.userId, email: data.user.email ?? null, role: row.role } : null;
  } catch {
    return null;
  }
}

export async function requireAdmin(opts: { role?: 'admin' } = {}): Promise<AdminSession> {
  const a = await getAdmin();
  if (!a) throw new ApiError('UNAUTHORIZED', 'Нужен вход в админку');
  if (opts.role === 'admin' && a.role !== 'admin') throw new ApiError('FORBIDDEN', 'Недостаточно прав для этого действия');
  return a;
}

/**
 * Для страниц админки. Layout и страница рендерятся параллельно, поэтому каждая страница
 * сама проверяет вход ДО обращения к данным; без входа — редирект на форму.
 */
export async function guardAdminPage(): Promise<AdminSession> {
  const a = await getAdmin();
  if (!a) redirect('/admin/login');
  return a;
}
