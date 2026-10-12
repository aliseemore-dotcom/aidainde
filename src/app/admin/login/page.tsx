import { redirect } from 'next/navigation';
import { LogoLink } from '@/components/ui/Logo';
import { getAdmin } from '@/lib/auth';
import { supabaseConfigured } from '@/lib/supabase/server';
import { signIn } from '../actions';

export const dynamic = 'force-dynamic';

const ERRORS: Record<string, string> = {
  '1': 'Неверная почта или пароль.', rate: 'Слишком много попыток. Подождите минуту.', config: 'Вход не настроен: задайте переменные Supabase.',
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  if (await getAdmin()) redirect('/admin');
  const { error } = await searchParams;
  return (
    <div className="page page--quiz">
      <header className="pagehead"><LogoLink /></header>
      <div className="stack">
        <h1 className="t-h1">Вход для редакторов</h1>
        {!supabaseConfigured() && <p className="k-notice t-body" role="status">{ERRORS.config}</p>}
        {error && <p className="k-notice k-notice--danger t-body" role="alert">{ERRORS[error] ?? ERRORS['1']}</p>}
        <form action={signIn} className="stack">
          <div className="field"><label htmlFor="email">Почта</label><input id="email" name="email" type="email" autoComplete="username" required className="admin-input" /></div>
          <div className="field"><label htmlFor="password">Пароль</label><input id="password" name="password" type="password" autoComplete="current-password" required className="admin-input" /></div>
          <div className="actions"><button type="submit" className="k-btn k-btn--primary">Войти</button></div>
        </form>
      </div>
    </div>
  );
}
