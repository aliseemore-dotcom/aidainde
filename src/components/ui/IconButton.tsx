import type { ButtonHTMLAttributes, ReactNode } from 'react';

/** Иконка-кнопка 44×44. aria-label обязателен (дизайн-код, раздел 7). */
export function IconButton({
  label, tone = 'surface', children, ...rest
}: { label: string; tone?: 'surface' | 'ink' | 'glass'; children: ReactNode } & Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'aria-label'>) {
  const t = tone === 'surface' ? '' : ` k-icon-btn--${tone}`;
  return <button type="button" aria-label={label} className={`k-icon-btn${t}`} {...rest}>{children}</button>;
}
