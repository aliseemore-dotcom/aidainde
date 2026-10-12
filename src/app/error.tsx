'use client';

import { useEffect } from 'react';
import { Art } from '@/components/ui/Art';
import { LogoLink } from '@/components/ui/Logo';

/** Общая граница ошибок: человеку — спокойное сообщение и «Повторить», детали остаются в логе. */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error('[ui] error', error.digest ?? ''); }, [error]);
  return (
    <div className="page">
      <header className="pagehead"><LogoLink /></header>
      <div className="hero-soon" role="alert">
        <Art name="notes" />
        <h1 className="t-h1">Что-то пошло не так</h1>
        <p className="t-body">Это ошибка на нашей стороне. Попробуй ещё раз, а если не получится — загляни чуть позже.</p>
        <div className="actions" style={{ justifyContent: 'center' }}>
          <button type="button" className="k-btn k-btn--primary" onClick={reset}>Повторить</button>
          {/* обычная ссылка: полная перезагрузка надёжнее выводит из состояния ошибки */}
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a className="k-btn k-btn--secondary" href="/">На главную</a>
        </div>
      </div>
    </div>
  );
}
