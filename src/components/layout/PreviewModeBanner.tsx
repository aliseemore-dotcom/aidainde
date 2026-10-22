'use client';

import { useEffect, useState } from 'react';

/**
 * Плашка «режим предпросмотра черновиков». Флаг узнаётся при открытии страницы, а не при сборке:
 * статические страницы остаются кэшируемыми, на боевом сайте запрос возвращает false и плашки нет.
 */
export function PreviewModeBanner() {
  const [on, setOn] = useState(false);
  useEffect(() => {
    let cancelled = false;
    fetch('/api/mode', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : { preview: false }))
      .then((j: { preview?: boolean }) => { if (!cancelled) setOn(!!j.preview); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);
  if (!on) return null;
  return (
    <p className="preview-mode" role="note">
      Режим предпросмотра: показаны черновики каталога. Данные ещё не проверены и не опубликованы.
    </p>
  );
}
