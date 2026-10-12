'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { supabaseConfigured, supabaseServer } from '@/lib/supabase/server';
import { clientIp, rateLimit } from '@/lib/security';
import { ApiError } from '@/lib/errors';

export async function signIn(formData: FormData): Promise<void> {
  if (!supabaseConfigured()) redirect('/admin/login?error=config');
  const h = await headers();
  try { rateLimit(`login:${clientIp(new Request('http://x', { headers: h }))}`, 8, 60_000); } catch (e) {
    if (e instanceof ApiError) redirect('/admin/login?error=rate');
    throw e;
  }
  const email = String(formData.get('email') ?? '').trim();
  const password = String(formData.get('password') ?? '');
  if (!email || !password || email.length > 200 || password.length > 200) redirect('/admin/login?error=1');
  const supabase = await supabaseServer();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  // одна и та же ошибка для неверного логина и пароля: не раскрываем, какой аккаунт существует
  if (error) redirect('/admin/login?error=1');
  redirect('/admin');
}

export async function signOut(): Promise<void> {
  if (supabaseConfigured()) await (await supabaseServer()).auth.signOut();
  redirect('/admin/login');
}
