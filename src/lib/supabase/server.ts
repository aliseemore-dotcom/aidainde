import 'server-only';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';

export function supabaseConfigured(): boolean {
  return !!process.env.NEXT_PUBLIC_SUPABASE_URL && !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
}

/** Клиент Supabase на сервере; сессия хранится в httpOnly-куках. */
export async function supabaseServer() {
  const store = await cookies();
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try { for (const c of list) store.set(c.name, c.value, c.options); } catch { /* вызов из Server Component: куки обновит proxy/действие */ }
      },
    },
  });
}
