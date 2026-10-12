import 'server-only';
import { eq } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { adminUsers } from '@/db/schema';
import { ApiError } from './errors';
import { supabaseConfigured, supabaseServer } from './supabase/server';

export interface AdminSession { userId: string; email: string | null; role: 'editor' | 'admin' }

/**
 * Текущий редактор или null. getUser() проверяет токен на стороне Supabase (а не просто читает куку),
 * затем права сверяются с нашей таблицей admin_users. Нет настройки Supabase — админки нет вообще.
 */
export async function getAdmin(): Promise<AdminSession | null> {
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
